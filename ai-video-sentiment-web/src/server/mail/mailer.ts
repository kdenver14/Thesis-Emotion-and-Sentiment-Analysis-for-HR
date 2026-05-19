import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "~/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

// Boundary: the only module that constructs an SMTP transport. Lazily built
// so an unconfigured dev/build never instantiates a connection. Errors are
// not swallowed; the caller decides whether a send failure is fatal.
function getTransporter(): Transporter {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error(
      "SMTP not configured: set SMTP_USER and SMTP_PASS (Gmail App Password) in .env",
    );
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
