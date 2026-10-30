"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

// Progressive disclosure for the session detail page: the emotion chart and
// the transcript are heavy, so only one shows at a time. Every panel stays
// mounted (hidden, not unmounted) so interactive children such as
// SpeakerTimeline keep their state when the user switches tabs.
export function SessionDetailTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Session views"
        className="inline-flex w-fit rounded-lg border border-gray-200 p-0.5"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              active === t.id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
