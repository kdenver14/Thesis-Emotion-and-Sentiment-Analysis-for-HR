import type { ReactNode } from "react";
import type { IconType } from "react-icons";

// One icon + value pair in a page header's facts row (place inside a <dl>).
// The icon stands in for a word label to keep the row light; it still names
// the value on hover and for screen readers.
export function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: IconType;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <dt>
        <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="text-gray-700">{children}</dd>
    </div>
  );
}
