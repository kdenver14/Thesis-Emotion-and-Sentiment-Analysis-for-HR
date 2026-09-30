"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiUpload } from "react-icons/fi";
import type { SessionMetadataInput } from "~/types/analysis";
import { createUpload, triggerInference } from "~/actions/upload";

interface UploadVideoProps {
  metadata: SessionMetadataInput;
  disabled?: boolean;
}

type Status = "idle" | "uploading" | "starting";

// Direct-to-R2 upload: the video never passes through Next (a 30-min HR
// video would OOM the server). createUpload -> PUT straight to the presigned
// URL -> triggerInference.
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Must match the Content-Type the URL was signed with.
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

function UploadVideo({ metadata, disabled = false }: UploadVideoProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    setProgress(0);
    setStatus("uploading");
    try {
      const created = await createUpload(metadata, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if ("error" in created) throw new Error(created.error);

      await putWithProgress(created.uploadUrl, file, setProgress);

      setStatus("starting");
      const started = await triggerInference(created.sessionId);
      if ("error" in started) throw new Error(started.error);

      router.push(`/dashboard/${created.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("idle");
      setProgress(0);
    }
  };

  const busy = status !== "idle";
  const label =
    status === "uploading"
      ? `Uploading... ${progress}%`
      : status === "starting"
        ? "Starting analysis..."
        : "Upload a video";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 p-10">
        <input
          type="file"
          accept="video/mp4,video/mov,video/avi"
          className="hidden"
          disabled={busy || disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
          id="video-upload"
        />
        <label
          htmlFor="video-upload"
          className={`flex cursor-pointer flex-col items-center ${busy || disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <FiUpload className="min-h-8 min-w-8 text-gray-400" />
          <h3 className="text-md mt-2 text-slate-800">{label}</h3>
          <p className="text-center text-xs text-gray-500">
            Get started with sentiment detection by uploading a video.
          </p>
        </label>
      </div>
      {status === "uploading" && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-gray-800 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {disabled && (
        <p className="text-center text-xs text-gray-400">
          Complete required fields above to upload.
        </p>
      )}
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

export default UploadVideo;
