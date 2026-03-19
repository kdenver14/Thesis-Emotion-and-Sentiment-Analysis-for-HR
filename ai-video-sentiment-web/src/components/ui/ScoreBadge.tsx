interface ScoreBadgeProps {
  score: number;
  /**
   * sm — compact pill, number only (for table cells)
   * lg — large number + /100 + strength label (for detail headers)
   */
  size?: "sm" | "lg";
}

function scoreVariant(score: number) {
  if (score >= 70) return { cls: "badge-positive", label: "Strong" };
  if (score >= 40) return { cls: "badge-review", label: "Moderate" };
  return { cls: "badge-negative", label: "Weak" };
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  const { cls, label } = scoreVariant(score);

  if (size === "lg") {
    return (
      <span className={cls}>
        <span className="text-base font-bold">{score}</span>
        <span className="font-normal opacity-70">/100</span>
        <span className="ml-1">{label}</span>
      </span>
    );
  }

  return <span className={cls}>{score}</span>;
}
