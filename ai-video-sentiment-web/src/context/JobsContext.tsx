"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type JobStatus = "processing" | "completed" | "failed";

export interface Job {
  sessionId: string;
  title: string;
  status: JobStatus;
  errorMessage?: string;
}

interface JobsContextValue {
  jobs: Job[];
  addJob: (sessionId: string, title: string) => void;
  clearDone: () => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const active = jobs.filter((j) => j.status === "processing");
    if (active.length === 0) return;

    const id = setInterval(() => {
      void (async () => {
        const updates = await Promise.all(
          active.map(async (job) => {
            try {
              const res = await fetch(`/api/jobs/${job.sessionId}`);
              if (!res.ok) return null;
              const data = (await res.json()) as {
                status: JobStatus;
                errorMessage?: string;
              };
              return { sessionId: job.sessionId, ...data };
            } catch {
              return null;
            }
          }),
        );

        setJobs((prev) =>
          prev.map((job) => {
            const update = updates.find((u) => u?.sessionId === job.sessionId);
            if (!update || update.status === job.status) return job;
            return {
              ...job,
              status: update.status,
              errorMessage: update.errorMessage,
            };
          }),
        );
      })();
    }, 3000);

    return () => clearInterval(id);
  }, [jobs]);

  const addJob = useCallback((sessionId: string, title: string) => {
    setJobs((prev) => [...prev, { sessionId, title, status: "processing" }]);
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "processing"));
  }, []);

  return (
    <JobsContext.Provider value={{ jobs, addJob, clearDone }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}
