import { notFound } from "next/navigation";
import { getSession } from "~/actions/sessions";
import { getEmployees } from "~/actions/employees";
import { SessionDetailClient } from "./SessionDetailClient";
import type { SerializedSession } from "./SessionDetailClient";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;
  const [session, employees] = await Promise.all([
    getSession(sessionId),
    getEmployees(),
  ]);

  if (!session) notFound();

  const serialized: SerializedSession = {
    id: session.id,
    title: session.title,
    sessionType: session.sessionType,
    sessionDateISO: session.sessionDate.toISOString(),
    topEmotion: session.topEmotion,
    topSentiment: session.topSentiment,
    avgEmotions: session.avgEmotions,
    summary: session.summary,
    engagementScore: session.engagementScore,
    durationSecs: session.durationSecs,
    employeeId: session.employeeId,
    employee: session.employee,
    utterances: session.utterances,
  };

  return <SessionDetailClient session={serialized} employees={employees} />;
}
