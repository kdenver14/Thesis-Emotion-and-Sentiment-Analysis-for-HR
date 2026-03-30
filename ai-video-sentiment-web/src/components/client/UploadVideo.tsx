"use client";

import { useState } from "react";
import { FiUpload } from "react-icons/fi";
import type { SessionMetadataInput } from "~/types/analysis";

interface UploadVideoProps {
  onJobStarted: (sessionId: string) => void;
  metadata: SessionMetadataInput;
}

function UploadVideo({ onJobStarted, metadata }: UploadVideoProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", metadata.title);
      formData.append("sessionType", metadata.sessionType);
      if (metadata.employeeId) formData.append("employeeId", metadata.employeeId);
      if (metadata.sessionDate) formData.append("sessionDate", metadata.sessionDate);
      if (metadata.interviewerName) formData.append("interviewerName", metadata.interviewerName);
      if (metadata.speakerCount) formData.append("speakerCount", String(metadata.speakerCount));

      const res = await fetch("/api/sentiment-inference", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to start analysis");
      }

      const { sessionId } = (await res.json()) as { sessionId: string };
      onJobStarted(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 p-10">
        <input
          type="file"
          accept="video/mp4,video/mov,video/avi"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
          id="video-upload"
        />
        <label
          htmlFor="video-upload"
          className={`flex cursor-pointer flex-col items-center ${uploading ? "opacity-60" : ""}`}
        >
          <FiUpload className="min-h-8 min-w-8 text-gray-400" />
          <h3 className="text-md mt-2 from-indigo-50 text-slate-800">
            {uploading ? "Uploading…" : "Upload a video"}
          </h3>
          <p className="text-center text-xs text-gray-500">
            Get started with sentiment detection by uploading a video.
          </p>
        </label>
      </div>
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

export default UploadVideo;
