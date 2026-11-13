// Demo mailbox constraint, enforced in code (not just procedure): every user
// address must be a plus-addressed alias of the single verification inbox so
// real strangers can never be emailed. scripts/create-admin.ts bypasses it
// and auto-verifies, so admin bootstrap is unaffected.
// Shape: blastasia.hr.app+<a-z 0-9 . (1-40)>@gmail.com.
export const DEMO_EMAIL_PREFIX = "blastasia.hr.app+";
export const DEMO_EMAIL_SUFFIX = "@gmail.com";
const MAX_SLUG = 40;
export const DEMO_EMAIL_PATTERN =
  /^blastasia\.hr\.app\+[a-z0-9.]{1,40}@gmail\.com$/;
export const DEMO_EMAIL_MESSAGE =
  "Email must be blastasia.hr.app+<name>@gmail.com (demo mailbox)";

// True once what is typed can no longer become a demo address: it has an "@"
// but is neither a full demo address nor one still being typed. Lets the form
// say so while typing instead of only on submit.
export function isOffDemoPattern(typed: string): boolean {
  const value = typed.trim().toLowerCase();
  const at = value.indexOf("@");
  if (at === -1 || DEMO_EMAIL_PATTERN.test(value)) return false;
  const domain = value.slice(at);
  const stillTyping =
    value.startsWith(DEMO_EMAIL_PREFIX) &&
    domain !== DEMO_EMAIL_SUFFIX &&
    DEMO_EMAIL_SUFFIX.startsWith(domain);
  return !stillTyping;
}

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
export function completeDemoEmail(
  typed: string,
  fullName: string,
): string | null {
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
