export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface LinkEmailInput {
  name: string | null;
  url: string;
}

interface WelcomeEmailInput extends LinkEmailInput {
  tempPassword: string;
}

const BRAND = "Blastasia HR";

// Pure renderers (no IO). Monochrome inline styles only: the design system
// uses no colored accents, so emails stay grayscale to match. No em dashes.
function shell(
  heading: string,
  body: string,
  url: string,
  cta: string,
): string {
  return [
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111827">',
    `<h2 style="font-size:18px;font-weight:600;color:#111827">${heading}</h2>`,
    `<p style="font-size:14px;line-height:1.6;color:#374151">${body}</p>`,
    `<p style="margin:24px 0"><a href="${url}" style="background:#1f2937;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:6px;display:inline-block">${cta}</a></p>`,
    `<p style="font-size:12px;color:#6b7280">If the button does not work, paste this link into your browser:</p>`,
    `<p style="font-size:12px;color:#6b7280;word-break:break-all">${url}</p>`,
    `<p style="font-size:12px;color:#9ca3af;margin-top:24px">${BRAND}</p>`,
    "</div>",
  ].join("");
}

// Sent when an admin creates the account: the verify link plus a one-time
// temporary password, which the user must replace at first sign-in.
export function welcomeTemplate({
  name,
  url,
  tempPassword,
}: WelcomeEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: `Your ${BRAND} account`,
    text: `${greeting}\n\nA ${BRAND} account was created for you.\n\n1. Confirm your email (this link expires in 15 minutes):\n${url}\n\n2. Sign in with your email and this temporary password: ${tempPassword}\n\nYou will then choose your own password.\n\nIf you did not expect this, you can ignore this email.\n\n${BRAND}`,
    html: shell(
      "Your account is ready",
      `${greeting} a ${BRAND} account was created for you. First confirm your email with the button below (valid for 15 minutes). Then sign in with your email and this temporary password: <strong style="font-family:monospace;font-size:15px;color:#111827">${tempPassword}</strong>. You will then choose your own password.`,
      url,
      "Verify email",
    ),
  };
}

export function verifyEmailTemplate({
  name,
  url,
}: LinkEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: `Verify your ${BRAND} account`,
    text: `${greeting}\n\nConfirm your email to activate your ${BRAND} account. This link expires in 15 minutes.\n\n${url}\n\nIf you did not expect this, you can ignore this email.\n\n${BRAND}`,
    html: shell(
      "Verify your account",
      `${greeting} confirm your email to activate your ${BRAND} account. This link expires in 15 minutes.`,
      url,
      "Verify email",
    ),
  };
}

export function stepUpCodeTemplate({
  name,
  code,
}: {
  name: string | null;
  code: string;
}): RenderedEmail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: `Your ${BRAND} security code`,
    text: `${greeting}\n\nUse this code to confirm your password change. It expires in 10 minutes.\n\n${code}\n\nIf you did not request this, you can ignore this email and your password stays unchanged.\n\n${BRAND}`,
    html: [
      '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111827">',
      '<h2 style="font-size:18px;font-weight:600;color:#111827">Confirm your password change</h2>',
      `<p style="font-size:14px;line-height:1.6;color:#374151">${greeting} use this code to confirm your password change. It expires in 10 minutes.</p>`,
      `<p style="margin:24px 0;font-size:30px;font-weight:700;letter-spacing:6px;color:#111827">${code}</p>`,
      '<p style="font-size:12px;color:#6b7280">If you did not request this, ignore this email. Your password stays unchanged.</p>',
      `<p style="font-size:12px;color:#9ca3af;margin-top:24px">${BRAND}</p>`,
      "</div>",
    ].join(""),
  };
}

export function loginCodeTemplate({
  name,
  code,
}: {
  name: string | null;
  code: string;
}): RenderedEmail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: `Your ${BRAND} sign-in code`,
    text: `${greeting}\n\nUse this code to finish signing in. It expires in 10 minutes.\n\n${code}\n\nIf you did not try to sign in, you can ignore this email and your account stays secure.\n\n${BRAND}`,
    html: [
      '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111827">',
      '<h2 style="font-size:18px;font-weight:600;color:#111827">Finish signing in</h2>',
      `<p style="font-size:14px;line-height:1.6;color:#374151">${greeting} use this code to finish signing in. It expires in 10 minutes.</p>`,
      `<p style="margin:24px 0;font-size:30px;font-weight:700;letter-spacing:6px;color:#111827">${code}</p>`,
      '<p style="font-size:12px;color:#6b7280">If you did not try to sign in, ignore this email. Your account stays secure.</p>',
      `<p style="font-size:12px;color:#9ca3af;margin-top:24px">${BRAND}</p>`,
      "</div>",
    ].join(""),
  };
}

export function resetPasswordTemplate({
  name,
  url,
}: LinkEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: `Reset your ${BRAND} password`,
    text: `${greeting}\n\nWe received a request to reset your password. This link expires in 15 minutes.\n\n${url}\n\nIf you did not request this, you can ignore this email and your password stays unchanged.\n\n${BRAND}`,
    html: shell(
      "Reset your password",
      `${greeting} we received a request to reset your password. This link expires in 15 minutes. If you did not request this, you can ignore this email.`,
      url,
      "Reset password",
    ),
  };
}
