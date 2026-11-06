const RESEND_URL = 'https://api.resend.com/emails'

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Sends an email via Resend's REST API. Throws on failure. */
export async function sendEmail({ to, subject, text, html }) {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env
  if (!RESEND_API_KEY || !EMAIL_FROM) throw new Error('Email is not configured')
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`)
  }
}

function layout(heading, body, link, cta) {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#111">
<h2 style="font-size:18px">${escape(heading)}</h2>
<p style="font-size:14px;line-height:1.5">${body}</p>
<p><a href="${escape(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${escape(cta)}</a></p>
<p style="font-size:12px;color:#666">Or paste this link into your browser:<br>${escape(link)}</p>
<p style="font-size:12px;color:#666">If you weren't expecting this email, you can ignore it.</p>
</div>`
}

export function inviteEmail({ to, link, invitedBy }) {
  const intro = `${invitedBy} invited you to the Oneida Gospel Church Deacon Board request form. This link works once and expires in 48 hours.`
  return {
    to,
    subject: "You're invited to the OGC Deacon Board request form",
    text: `${intro}\n\nAccept the invite: ${link}`,
    html: layout("You're invited", escape(intro), link, 'Accept invite'),
  }
}

export function confirmEmail({ to, link }) {
  const intro = 'Confirm your email address to finish registering. This link expires in 24 hours.'
  return {
    to,
    subject: 'Confirm your email — OGC Deacon Board requests',
    text: `${intro}\n\nConfirm: ${link}`,
    html: layout('Confirm your email', intro, link, 'Confirm my email'),
  }
}

export function loginEmail({ to, link }) {
  const intro = 'Use this link to sign in. It works once and expires in 15 minutes.'
  return {
    to,
    subject: 'Your sign-in link — OGC Deacon Board requests',
    text: `${intro}\n\nSign in: ${link}`,
    html: layout('Sign in', intro, link, 'Sign in'),
  }
}
