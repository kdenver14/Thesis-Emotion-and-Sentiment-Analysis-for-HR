import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

// R2 is S3-compatible. All persistence/IO for uploaded video lives here so
// no other layer talks to the storage SDK directly.

const PUT_URL_TTL = 600; // 10 min: client upload window
const GET_URL_TTL = 3600; // 1 h: must outlive Modal cold start + queue wait

// Optional env (main must boot without R2 configured). Fail loudly only when
// the storage path is actually exercised.
function requireR2(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
} {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    throw new Error("R2 storage is not configured (R2_* env vars missing)");
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

export function r2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET,
  );
}

let cached: { client: S3Client; bucket: string } | null = null;

function client(): { client: S3Client; bucket: string } {
  if (cached) return cached;
  const cfg = requireR2();
  cached = {
    bucket: cfg.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    }),
  };
  return cached;
}

export async function presignPutUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const { client: c, bucket } = client();
  return getSignedUrl(
    c,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: PUT_URL_TTL },
  );
}

export async function presignGetUrl(key: string): Promise<string> {
  const { client: c, bucket } = client();
  return getSignedUrl(
    c,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: GET_URL_TTL },
  );
}

// null = object absent. Used to reject orphaned/oversized uploads before
// spawning inference (plan section 4b gaps 1 + 4).
export async function headObject(
  key: string,
): Promise<{ size: number } | null> {
  const { client: c, bucket } = client();
  try {
    const r = await c.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return { size: r.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { client: c, bucket } = client();
  await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
