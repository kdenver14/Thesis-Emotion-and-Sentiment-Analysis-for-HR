// Tab completion for the demo mailbox address. Must stay in step with
// DEMO_EMAIL in src/actions/users.ts: blastasia.hr.app+<a-z 0-9 . (1-40)>@gmail.com.
export const DEMO_EMAIL_PREFIX = "blastasia.hr.app+";
export const DEMO_EMAIL_SUFFIX = "@gmail.com";
const MAX_SLUG = 40;

// "Juan Dela Cruz" -> "juan.dela.cruz"; accents dropped ("Peña" -> "pena").
export function toEmailSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/\.+$/, "");
}

// The full address for what is typed so far, or null when there is nothing
// to complete (Tab then moves focus as usual). An empty field, or a partly
// typed prefix, takes the name from the Name field.
export function completeDemoEmail(typed: string, fullName: string): string | null {
  const value = typed.trim().toLowerCase();
  const source = DEMO_EMAIL_PREFIX.startsWith(value)
    ? fullName
    : value.startsWith(DEMO_EMAIL_PREFIX)
      ? value.slice(DEMO_EMAIL_PREFIX.length)
      : value;
  const slug = toEmailSlug(source.split("@")[0] ?? "");
  if (!slug) return null;
  const full = `${DEMO_EMAIL_PREFIX}${slug}${DEMO_EMAIL_SUFFIX}`;
  return full === typed ? null : full;
}
