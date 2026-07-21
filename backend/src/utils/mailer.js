// Single send({ to, subject, html }) interface with two drivers:
// - console (default/dev): prints the email to stdout, nothing external.
// - resend (prod): posts to the Resend API. Requires RESEND_API_KEY.
// Selected via MAIL_DRIVER env var so prod config is a one-line env change,
// no code change.

const driver = process.env.MAIL_DRIVER || 'console';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

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

  console.log(`[mailer:console] to=${to} subject="${subject}"\n${html}`);
}

module.exports = { send, outbox };
