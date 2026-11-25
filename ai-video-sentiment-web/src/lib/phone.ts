export const PHONE_DIGITS = 10;

/** Stored form: a Philippine mobile number, "+63 9XX XXX XXXX". */
export const STORED_PHONE_PATTERN = /^\+63 9\d{2} \d{3} \d{4}$/;
export const PHONE_FORMAT_MESSAGE =
  "Phone must be a mobile number starting with 9";

/**
 * Strip non-digits and a typed "0" or pasted "63" prefix, cap at the national
 * number length. Mobile numbers start with 9, so anything else becomes "".
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^(63)?0?/, "");
  return digits.startsWith("9") ? digits.slice(0, PHONE_DIGITS) : "";
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
