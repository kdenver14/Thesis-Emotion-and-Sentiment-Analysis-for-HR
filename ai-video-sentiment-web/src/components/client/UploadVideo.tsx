"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiFilm, FiUpload } from "react-icons/fi";
import type { SessionMetadataInput } from "~/types/analysis";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import { createUpload, reportUploadFailed, triggerInference } from "~/actions/upload";
import { trackUpload, untrackUpload } from "./uploadRegistry";
import { clearDraft, useDraft } from "./uploadDraft";

interface UploadVideoProps {
  metadata: SessionMetadataInput;
  disabled?: boolean;
}

type Picked = { file: File; url: string };

const INPUT_ID = "video-upload";
const BYTES_PER_MB = 1024 * 1024;
const SECONDS_PER_MINUTE = 60;

// Direct-to-R2 upload: the video never passes through Next (a 30-min HR
// video would OOM the server).
function putVideo(url: string, file: File, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Upload cancelled"));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Must match the Content-Type the URL was signed with.
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

// Runs after the user has been sent to the session page. It keeps going
// during in-app navigation (same tab), and that page shows the state and
// the Cancel button, which can stop it through uploadRegistry.
async function sendInBackground(sessionId: string, uploadUrl: string, file: File): Promise<void> {
  const controller = new AbortController();
  trackUpload(sessionId, controller);
  try {
    await putVideo(uploadUrl, file, controller.signal);
    const started = await triggerInference(sessionId);
    if ("error" in started) throw new Error(started.error);
  } catch (err) {
    if (controller.signal.aborted) return; // cancelled: the session page cleaned up
    console.error(`Upload for ${sessionId} failed`, err);
    // Flip the session to FAILED so its page stops showing "Uploading...".
    await reportUploadFailed(sessionId).catch((e: unknown) =>
      console.error(`Could not report the failed upload for ${sessionId}`, e),
    );
  } finally {
    untrackUpload(sessionId);
  }
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const s = String(total % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${Math.floor(total / SECONDS_PER_MINUTE)}:${s}`;
}

// Step between choosing a file and uploading it, so a mis-click on the wrong
// video costs nothing: the user sees and can play what they picked.
function VideoConfirmCard({
  picked,
  metadata,
  disabled,
  starting,
  onUpload,
}: {
  picked: Picked;
  metadata: SessionMetadataInput;
  disabled: boolean;
  starting: boolean;
  onUpload: () => void;
}) {
  const [duration, setDuration] = useState<number | null>(null);
  // Browsers cannot play .avi and some .mov codecs; the upload still works.
  const [unplayable, setUnplayable] = useState(false);
  const length = unplayable ? "Unknown" : duration === null ? "..." : formatDuration(duration);
  const details: [string, string][] = [
    ["File", picked.file.name],
    ["Size", `${(picked.file.size / BYTES_PER_MB).toFixed(1)} MB`],
    ["Length", length],
    ["Session", metadata.title],
    ["Type", SESSION_TYPE_LABELS[metadata.sessionType] ?? metadata.sessionType],
  ];

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-gray-200 p-4 sm:flex-row">
      {/* self-start keeps 16:9; stretching to the details' height distorts it. */}
      <div className="aspect-video w-full flex-shrink-0 self-start overflow-hidden rounded-lg bg-black sm:w-72">
        {unplayable ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-50 text-gray-400">
            <FiFilm className="h-6 w-6" aria-hidden />
            <span className="text-xs">No preview for this format</span>
          </div>
        ) : (
          <video
            // #t=0.1 makes the browser draw a real first frame, not a black box.
            src={`${picked.url}#t=0.1`}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setUnplayable(true)}
            className="h-full w-full object-contain"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Values sit right after their labels, not at the far edge. */}
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-gray-500">{label}</dt>
              <dd className="truncate text-gray-900" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onUpload}
            disabled={disabled || starting}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? "Starting..." : "Upload and analyze"}
          </button>
          <label
            htmlFor={INPUT_ID}
            className={`cursor-pointer rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 ${starting ? "pointer-events-none opacity-50" : ""}`}
          >
            Change video
          </label>
          {disabled && !starting && (
            <span className="text-xs text-gray-500">
              Complete the required fields above to upload.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadVideo({ metadata, disabled = false }: UploadVideoProps) {
  const router = useRouter();
  // The chosen File is part of the draft, so it survives a visit to another tab.
  const [file, setFile] = useDraft<File | null>("upload.file", null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview URL per mount; revoked when the pick changes and on unmount. The
  // background upload sends the File itself, so revoking never stops it.
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const picked: Picked | null = file && url ? { file, url } : null;

  const choose = (next: File) => {
    setError(null);
    setFile(next);
  };

  // Creates the session, sends the user to its page right away, then
  // uploads and starts the analysis in the background.
  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setStarting(true);
    const created = await createUpload(metadata, { name: file.name, type: file.type, size: file.size })
      .catch(() => ({ error: "Could not start the upload. Check your connection." }));
    if ("error" in created) {
      setError(created.error);
      setStarting(false);
      return;
    }
    clearDraft(); // the next upload starts from an empty form
    router.push(`/dashboard/${created.sessionId}`);
    await sendInBackground(created.sessionId, created.uploadUrl, file);
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        type="file"
        // Extensions first: every browser maps them; video/mov and video/avi
        // are not real MIME types and could hide .mov/.avi in the picker.
        accept=".mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo"
        className="hidden"
        disabled={starting}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // picking the same file again still fires onChange
          if (file) choose(file);
        }}
        id={INPUT_ID}
      />
      {picked ? (
        <VideoConfirmCard
          key={picked.url} // fresh length/preview state for each new pick
          picked={picked}
          metadata={metadata}
          disabled={disabled}
          starting={starting}
          onUpload={() => void handleUpload()}
        />
      ) : (
        <label
          htmlFor={INPUT_ID}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 p-10"
        >
          <FiUpload className="min-h-8 min-w-8 text-gray-400" />
          <h3 className="text-md mt-2 text-slate-800">Choose a video</h3>
          <p className="text-center text-xs text-gray-500">
            You can check it before it uploads.
          </p>
        </label>
      )}
      {/* With a video picked, the card shows this hint beside its button. */}
      {disabled && !picked && (
        <p className="text-center text-xs text-gray-400">
          Complete required fields above to upload.
        </p>
      )}
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

export default UploadVideo;
