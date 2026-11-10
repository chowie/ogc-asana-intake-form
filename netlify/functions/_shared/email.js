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

export function inviteEmail({ to, firstName, link, inviterName, inviterEmail }) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'
  const from = inviterName && inviterName !== inviterEmail ? `${inviterName} (${inviterEmail})` : inviterEmail
  const intro = `${from} has invited you to the Oneida Gospel Church Deacon Board request form — the place to send requests to the deacons so they're tracked and followed up on.`
  const fine = 'This link works once and expires in 48 hours. If you have questions about this invitation, contact ' + from + ' directly.'
  return {
    to,
    subject: `${inviterName || 'A deacon'} invited you to the OGC Deacon Board request form`,
    text: `${greeting}\n\n${intro}\n\nAccept the invite: ${link}\n\n${fine}`,
    html: layout("You're invited", `${escape(greeting)}<br><br>${escape(intro)}<br><br>${escape(fine)}`, link, 'Accept invite'),
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

export function emailChangeEmail({ to, newEmail, link }) {
  const intro = `Someone signed in to your OGC Deacon Board request form account asked to change its sign-in email from ${to} to ${newEmail}. If this was you, click the button below to approve it; we'll then send a link to the new address to confirm it's yours. If it wasn't you, ignore this email — nothing will change. The link works once and expires in 1 hour.`
  return {
    to,
    subject: 'Confirm your email change — OGC Deacon Board requests',
    text: `${intro}\n\nConfirm the change: ${link}`,
    html: layout('Confirm your email change', escape(intro), link, 'Yes, I requested this'),
  }
}

export function newAddressEmail({ to, link }) {
  const intro = 'Your request to make this your sign-in email for the OGC Deacon Board request form was approved from your previous address. Click below to confirm this address is yours and finish the change. The link works once and expires in 1 hour.'
  return {
    to,
    subject: 'Confirm your new sign-in email — OGC Deacon Board requests',
    text: `${intro}\n\nConfirm this address: ${link}`,
    html: layout('Confirm your new email', escape(intro), link, 'Confirm this address'),
  }
}

export const FOLLOW_HELP =
  'To get updates, open the task in Asana and click Follow. You will need a free Asana account; the first time, Asana may ask you to "Request access", which a deacon will approve.'

export function taskCreatedEmail({ to, name, title, taskUrl }) {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const intro = `Your request "${title}" has been added to the Deacon Board's task list.`
  return {
    to,
    subject: `Request received: ${String(title).replace(/\s+/g, ' ').slice(0, 120)}`,
    text: `${greeting}\n\n${intro}\n\n${FOLLOW_HELP}\n\nView the task: ${taskUrl}`,
    html: layout('Request received', `${escape(greeting)}<br><br>${escape(intro)}<br><br>${escape(FOLLOW_HELP)}`, taskUrl, 'Open in Asana'),
  }
}
