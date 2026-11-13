"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

interface ConfirmOptions {
  message: string;
  // Named for what the button does ("Delete", "Archive"), never just "OK".
  confirmLabel: string;
  // Red outline for actions that remove or hide something.
  destructive?: boolean;
}

interface ConfirmApi {
  // Resolves true only when the action button is clicked; Cancel, Escape
  // and a click outside the card all resolve false.
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // A message with a single OK button, in place of the browser's alert().
  notify: (message: string) => Promise<void>;
}

type Shown = ConfirmOptions & { notice: boolean };

const ConfirmContext = createContext<ConfirmApi | null>(null);

// Gray, not the browser's blue: the UI is monochrome.
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2";
const destructiveButton = `rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 ${focusRing}`;
const primaryButton = `rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 ${focusRing}`;
const neutralButton = `rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 ${focusRing}`;

// In-app replacement for the browser's confirm() and alert() pop-ups. Built
// on <dialog> with showModal(), which gives the dimmed backdrop, Escape to
// cancel and keyboard focus kept inside the card.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  // Set when answer() closes the dialog: its close event fires later, maybe
  // after a new question has opened, and must not answer that one.
  const closingRef = useRef(false);
  const messageId = useId();
  const pathname = usePathname();

  const show = useCallback((next: Shown) => {
    // A newer question replaces one left unanswered: the old one is a no.
    resolveRef.current?.(false);
    setShown(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (options) => show({ ...options, notice: false }),
      notify: (message) =>
        show({ message, confirmLabel: "OK", notice: true }).then(() => undefined),
    }),
    [show],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!shown || !dialog) return;
    if (!dialog.open) dialog.showModal();
    // Cancel first, so Enter on a destructive question does nothing harmful.
    (cancelRef.current ?? actionRef.current)?.focus();
  }, [shown]);

  const answer = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setShown(null);
    const dialog = dialogRef.current;
    if (dialog?.open) {
      closingRef.current = true;
      dialog.close();
    }
  }, []);

  // A question belongs to its page: going Back or elsewhere answers no.
  useEffect(() => {
    if (dialogRef.current?.open) answer(false);
  }, [pathname, answer]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={messageId}
        onClose={() => {
          if (closingRef.current) {
            closingRef.current = false;
            return;
          }
          // Closed without an answer (Escape): that is a no.
          resolveRef.current?.(false);
          resolveRef.current = null;
          setShown(null);
        }}
        // Only the backdrop targets the <dialog> itself; the card fills it.
        onClick={(e) => {
          if (e.target === e.currentTarget) answer(false);
        }}
        className="w-[calc(100%-2rem)] max-w-sm rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        {shown && (
          <div className="flex flex-col gap-4 p-5">
            <p id={messageId} className="text-sm leading-relaxed text-gray-800">
              {shown.message}
            </p>
            <div className="flex justify-end gap-2">
              {!shown.notice && (
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => answer(false)}
                  className={neutralButton}
                >
                  Cancel
                </button>
              )}
              <button
                ref={actionRef}
                type="button"
                onClick={() => answer(true)}
                className={shown.destructive ? destructiveButton : primaryButton}
              >
                {shown.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const api = useContext(ConfirmContext);
  if (!api) throw new Error("useConfirm must be used inside ConfirmProvider");
  return api;
}
