"use client";

import { useState } from "react";
import Link from "next/link";
import { FiExternalLink } from "react-icons/fi";
import UploadVideo from "./UploadVideo";
import type { EmployeeRow } from "~/server/repositories/employee";
import type { SessionType } from "~/types/analysis";
import { SESSION_TYPES, SESSION_TYPE_LABELS } from "~/types/analysis";

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

const SENTIMENT_EMOJI: Record<string, string> = {
  negative: "😡",
  neutral: "😐",
  positive: "😄",
};

export type Analysis = {
  sessionId: string;
  analysis: {
    utterances: Array<{
      start_time: number;
      end_time: number;
      text: string;
      emotions: Array<{ label: string; confidence: number }>;
      sentiments: Array<{ label: string; confidence: number }>;
    }>;
  };
};

interface InferenceProps {
  employees: EmployeeRow[];
}

export function Inference({ employees }: InferenceProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("general");
  const [employeeId, setEmployeeId] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const getAverageScores = () => {
    if (!analysis?.analysis.utterances.length) return null;

    const emotionScores: Record<string, number[]> = {};
    const sentimentScores: Record<string, number[]> = {};

    analysis.analysis.utterances.forEach((utterance) => {
      utterance.emotions.forEach((emotion) => {
        if (!emotionScores[emotion.label]) emotionScores[emotion.label] = [];
        emotionScores[emotion.label]!.push(emotion.confidence);
      });
      utterance.sentiments.forEach((sentiment) => {
        if (!sentimentScores[sentiment.label])
          sentimentScores[sentiment.label] = [];
        sentimentScores[sentiment.label]!.push(sentiment.confidence);
      });
    });

    const avgEmotions = Object.entries(emotionScores).map(
      ([label, scores]) => ({
        label,
        confidence: scores.reduce((a, b) => a + b, 0) / scores.length,
      }),
    );

    const avgSentiments = Object.entries(sentimentScores).map(
      ([label, scores]) => ({
        label,
        confidence: scores.reduce((a, b) => a + b, 0) / scores.length,
      }),
    );

    const topEmotion = avgEmotions.sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    const topSentiment = avgSentiments.sort(
      (a, b) => b.confidence - a.confidence,
    )[0];

    return { topEmotion, topSentiment };
  };

  const averages = getAverageScores();

  const metadata = {
    title: title || `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType,
    employeeId: employeeId || undefined,
    sessionDate: sessionDate ? new Date(sessionDate).toISOString() : undefined,
  };

  return (
    <div className="flex h-fit w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-slate-700">Session details</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Title</label>
            <input
              type="text"
              placeholder="Session title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Type</label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SESSION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Employee (optional)</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            >
              <option value="">— none —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                  {emp.department ? ` (${emp.department})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <UploadVideo onAnalysis={setAnalysis} metadata={metadata} />

      {analysis?.sessionId && (
        <Link
          href={`/dashboard/${analysis.sessionId}`}
          className="flex items-center gap-1.5 self-start rounded-md bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
        >
          <FiExternalLink className="h-4 w-4" />
          View in Dashboard
        </Link>
      )}

      <h2 className="mt-2 text-sm text-slate-800">Overall analysis</h2>
      {averages ? (
        <div className="flex h-fit w-full flex-wrap items-center justify-center gap-4 rounded-xl border border-gray-200 p-4 sm:gap-8 sm:px-6">
          <div className="flex flex-col items-center">
            <span className="text-sm">Primary emotion</span>
            <span className="text-[40px]">
              {EMOTION_EMOJI[averages.topEmotion?.label ?? ""]}
            </span>
            <span className="text-sm text-gray-500">
              {averages.topEmotion?.confidence.toFixed(3)} (
              {((averages.topEmotion?.confidence ?? 0) * 100).toFixed(0)}%)
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm">Primary Sentiment</span>
            <span className="text-[40px]">
              {SENTIMENT_EMOJI[averages.topSentiment?.label ?? ""]}
            </span>
            <span className="text-sm text-gray-500">
              {averages.topSentiment?.confidence.toFixed(3)} (
              {((averages.topSentiment?.confidence ?? 0) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      ) : (
        <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-gray-200 p-4">
          <span className="text-sm text-gray-400">
            Upload a video to see overall analysis
          </span>
        </div>
      )}

      <h2 className="mt-2 text-sm text-slate-800">Analysis of utterances</h2>
      {analysis ? (
        <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-1">
          {analysis.analysis.utterances.map((utterance) => (
            <div
              key={
                utterance.start_time.toString() + utterance.end_time.toString()
              }
              className="flex h-fit w-full flex-wrap justify-between gap-8 rounded-xl border border-gray-200 px-6 py-4 sm:gap-4"
            >
              <div className="flex w-full max-w-24 flex-col justify-center">
                <div className="text-sm font-semibold">
                  {Number(utterance.start_time).toFixed(1)} -{" "}
                  {Number(utterance.end_time).toFixed(1)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {utterance.text}
                </div>
              </div>

              <div className="flex w-full max-w-48 flex-col gap-2">
                <span className="text-sm font-medium">Emotions</span>
                {utterance.emotions.map((emo) => (
                  <div key={emo.label} className="flex items-center gap-2">
                    <span className="w-16 whitespace-nowrap text-xs text-gray-500">
                      {EMOTION_EMOJI[emo.label]} {emo.label}
                    </span>
                    <div className="flex-1">
                      <div className="h-1 w-full rounded-full bg-gray-100">
                        <div
                          style={{ width: `${emo.confidence * 100}%` }}
                          className="h-1 rounded-full bg-gray-800"
                        />
                      </div>
                      <span className="w-8 text-right text-xs">
                        {(emo.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex w-full max-w-48 flex-col gap-2">
                <span className="text-sm font-medium">Sentiments</span>
                {utterance.sentiments.map((sentiment) => (
                  <div
                    key={sentiment.label}
                    className="flex items-center gap-2"
                  >
                    <span className="w-16 whitespace-nowrap text-xs text-gray-500">
                      {SENTIMENT_EMOJI[sentiment.label]} {sentiment.label}
                    </span>
                    <div className="flex-1">
                      <div className="h-1 w-full rounded-full bg-gray-100">
                        <div
                          style={{ width: `${sentiment.confidence * 100}%` }}
                          className="h-1 rounded-full bg-gray-800"
                        />
                      </div>
                      <span className="w-8 text-right text-xs">
                        {(sentiment.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-gray-200 p-4">
          <span className="text-sm text-gray-400">
            Upload a video to see analysis results
          </span>
        </div>
      )}
    </div>
  );
}
