import { useEffect, useState } from "react";

// Upload form draft. Module state survives in-app navigation (the user can
// check the Employees tab and come back) but not a page reload. It is only
// written from effects, which never run on the server, so no draft is ever
// shared between users.
const draft = new Map<string, unknown>();

export function useDraft<T>(key: string, initial: T) {
  // Each key is only ever written by the hook call that reads it, so the
  // stored value has type T.
  const [value, setValue] = useState<T>(() =>
    draft.has(key) ? (draft.get(key) as T) : initial,
  );
  useEffect(() => {
    draft.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

export function clearDraft(): void {
  draft.clear();
}
