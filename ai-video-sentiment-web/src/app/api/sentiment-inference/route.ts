import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import { sessionMetadataSchema } from "~/schemas/session";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${ext}` },
      { status: 400 },
    );
  }

  const metadataParsed = sessionMetadataSchema.safeParse({
    title:
      formData.get("title") ??
      `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType: formData.get("sessionType") ?? "general",
    employeeId: formData.get("employeeId") ?? undefined,
    sessionDate: formData.get("sessionDate") ?? undefined,
    interviewerName: formData.get("interviewerName") ?? undefined,
    speakerCount: formData.get("speakerCount") ?? undefined,
  });

  if (!metadataParsed.success) {
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 },
    );
  }
  const metadata = metadataParsed.data;

  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}${ext}`);
  let buffer: Buffer;

  try {
    buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);
  } catch (error) {
    console.error("File write error:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 },
    );
  }

  // POST to FastAPI /jobs — returns immediately with a job_id
  let inferenceJobId: string;
  try {
    const inferFormData = new FormData();
    inferFormData.append(
      "file",
      new Blob([buffer], { type: file.type }),
      file.name,
    );
    if (metadata.speakerCount) {
      inferFormData.append("num_speakers", String(metadata.speakerCount));
    }

    const jobRes = await fetch(`${env.LOCAL_INFERENCE_URL}/jobs`, {
      method: "POST",
      body: inferFormData,
    });

    if (!jobRes.ok) {
      const detail = await jobRes.text();
      console.error("Failed to enqueue inference job:", detail);
      return NextResponse.json(
        { error: "Failed to start analysis" },
        { status: 502 },
      );
    }

    const jobData = (await jobRes.json()) as { job_id: string };
    inferenceJobId = jobData.job_id;
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }

  const analysisSession = await db.analysisSession.create({
    data: {
      userId,
      employeeId: metadata.employeeId ?? null,
      title: metadata.title,
      sessionType: metadata.sessionType,
      sessionDate: metadata.sessionDate
        ? new Date(metadata.sessionDate)
        : new Date(),
      interviewerName: metadata.interviewerName ?? null,
      videoKey: randomUUID(),
      inferenceJobId,
      status: "processing",
    },
  });

  return NextResponse.json({ sessionId: analysisSession.id });
}
