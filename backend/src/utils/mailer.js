// Single send({ to, subject, html }) interface with three drivers:
// - console (default/dev): prints the email to stdout, nothing external.
// - resend: posts to the Resend API. Requires RESEND_API_KEY. Free tier is
//   sandboxed to the account owner's own email until a domain is verified
//   (resend.com/domains) - fine for solo testing, not for real recipients.
// - gmail: SMTP via nodemailer using a Gmail account + App Password. No
//   domain verification needed (Gmail's own domain is already trusted), so
//   this is the pragmatic choice when the sender has no custom domain.
// Selected via MAIL_DRIVER env var so prod config is a one-line env change,
// no code change.

const nodemailer = require('nodemailer');

const driver = process.env.MAIL_DRIVER || 'console';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// Test-only record of sent mail. Verification tokens must never be returned
// in an API response (see auth.routes.js) - this is how tests reach the link
// that would otherwise only exist in a real inbox / console output.
const outbox = [];

async function sendViaResend({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.error('[mailer] MAIL_DRIVER=resend but RESEND_API_KEY is not set - email not sent');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error('[mailer] Resend API error', res.status, await res.text().catch(() => ''));
  }
}

// Created lazily (not at module load) so a missing GMAIL_APP_PASSWORD only
// breaks sends, not `require('./mailer')` itself (e.g. in tests, which never
// reach this driver since NODE_ENV=test short-circuits into the outbox).
let gmailTransporter = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    // Explicit host/port/STARTTLS instead of `service: 'gmail'` (which
    // defaults to port 465/SSL) - some PaaS free tiers throttle or block
    // 465 but allow 587/STARTTLS. connectionTimeout keeps a genuinely
    // blocked port from hanging the request for the platform's default
    // (much longer) socket timeout.
    gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
    });
  }
  return gmailTransporter;
}

async function sendViaGmail({ to, subject, html }) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('[mailer] MAIL_DRIVER=gmail but GMAIL_USER/GMAIL_APP_PASSWORD is not set - email not sent');
    return;
  }
  try {
    await getGmailTransporter().sendMail({ from: GMAIL_USER, to, subject, html });
  } catch (err) {
    console.error('[mailer] Gmail SMTP error', err.message);
  }
}

async function send({ to, subject, html }) {
  if (process.env.NODE_ENV === 'test') {
    // Tests read the outbox directly instead of stdout - skip printing so
    // `npm test` output isn't dominated by mail bodies for every registered user.
    outbox.push({ to, subject, html });
    return;
  }

  if (driver === 'resend') {
    await sendViaResend({ to, subject, html });
    return;
  }
  if (driver === 'gmail') {
    await sendViaGmail({ to, subject, html });
    return;
  }

  console.log(`[mailer:console] to=${to} subject="${subject}"\n${html}`);
}

module.exports = { send, outbox };
