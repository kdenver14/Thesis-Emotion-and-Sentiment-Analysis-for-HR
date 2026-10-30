"use client";

import dynamic from "next/dynamic";
import type { Score } from "~/types/analysis";

// EmotionBarChart pulls in recharts. The session detail page is a server
// component, so the on-demand import has to happen from a client boundary;
// this wrapper is that boundary and nothing more.
const Chart = dynamic(
  () =>
    import("~/components/client/charts/EmotionBarChart").then(
      (m) => m.EmotionBarChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] w-full animate-pulse rounded-lg bg-gray-50" />
    ),
  },
);

export function EmotionBarChartLazy(props: { data: Score[]; height?: number }) {
  return <Chart {...props} />;
}
