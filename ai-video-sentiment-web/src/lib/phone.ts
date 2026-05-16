export const PHONE_DIGITS = 10;

/** Strip non-digits, cap at the national number length (no +63 prefix). */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(0, PHONE_DIGITS);
}

/** Group a digit string as 3-3-4 (e.g. "9171234567" -> "917 123 4567"). */
export function formatPhone(digits: string): string {
  const d = digits.slice(0, PHONE_DIGITS);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)]
    .filter(Boolean)
    .join(" ");
}

/** Stored form with country code, or undefined when empty. */
export function toStoredPhone(digits: string): string | undefined {
  return digits ? `+63 ${formatPhone(digits)}` : undefined;
}
