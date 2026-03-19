const VARIANTS = {
  // Sentiment
  positive: { cls: "badge-positive", dot: "bg-green-500", label: "Positive" },
  neutral: { cls: "badge-neutral", dot: "bg-slate-400", label: "Neutral" },
  negative: { cls: "badge-negative", dot: "bg-red-500", label: "Negative" },
  // Session / candidate status
  active: { cls: "badge-positive", dot: "bg-green-500", label: "Active" },
  review: { cls: "badge-review", dot: "bg-amber-500", label: "In Review" },
  pending: { cls: "badge-neutral", dot: "bg-slate-400", label: "Pending" },
  completed: { cls: "badge-neutral", dot: "bg-slate-300", label: "Completed" },
} as const;

type Status = keyof typeof VARIANTS;

interface StatusBadgeProps {
  status: Status;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const variant = VARIANTS[status];
  return (
    <span className={variant.cls}>
      <span className={`h-1.5 w-1.5 rounded-full ${variant.dot}`} />
      {label ?? variant.label}
    </span>
  );
}
