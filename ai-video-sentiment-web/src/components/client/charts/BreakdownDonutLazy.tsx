"use client";

import dynamic from "next/dynamic";

// Keeps recharts out of the session page's first load (slow mobile data);
// dynamic(ssr:false) is only allowed from a client boundary like this one.
export const BreakdownDonutLazy = dynamic(
  () => import("./BreakdownDonut").then((m) => m.BreakdownDonut),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 w-40 animate-pulse rounded-full bg-gray-50" />
    ),
  },
);
