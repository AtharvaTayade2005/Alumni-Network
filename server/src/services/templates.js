const layout = ({ title, body, ctaLabel, ctaUrl, footer }) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0b1220;padding:32px 16px">
  <div style="max-width:560px;margin:0 auto;background:#111c31;border:1px solid #1e293b;border-radius:16px;overflow:hidden">
    <div style="padding:20px 28px;border-bottom:1px solid #1e293b">
      <span style="color:#34d399;font-weight:700;letter-spacing:.02em;font-size:14px">Alumni Network Portal</span>
    </div>
    <div style="padding:28px">
      <h1 style="margin:0 0 16px;color:#f8fafc;font-size:20px;line-height:1.3">${title}</h1>
      <div style="color:#cbd5e1;font-size:15px;line-height:1.65">${body}</div>
      ${ctaUrl ? `<div style="margin-top:24px">
        <a href="${ctaUrl}" style="display:inline-block;background:#10b981;color:#052e1f;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">${ctaLabel}</a>
      </div>` : ''}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #1e293b;color:#64748b;font-size:12px">
      ${footer ?? 'You are receiving this because your account is registered on the Alumni Network Portal.'}
    </div>
  </div>
</div>`

const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const TEMPLATES = {
  email_verification: ({ link }) => {
    const html = layout({
      title: 'Verify your email address',
      body: '<p>Welcome to the Alumni Network Portal. Confirm your email address to activate your account and unlock directory search, messaging and mentorship.</p>',
      ctaLabel: 'Verify email address',
      ctaUrl: link,
    })
    return { html, text: stripTags(html) }
  },
  password_reset: ({ link }) => {
    const html = layout({
      title: 'Reset your password',
      body: '<p>We received a request to reset your password. This link expires shortly. If you did not request this, you can safely ignore this email.</p>',
      ctaLabel: 'Choose a new password',
      ctaUrl: link,
    })
    return { html, text: stripTags(html) }
  },
  mentorship_request: ({ menteeName, area }) => {
    const html = layout({
      title: 'New mentorship request',
      body: `<p>${menteeName} has asked to be mentored by you in <strong>${area}</strong>.</p>
             <p>Sign in to review the request and respond.</p>`,
      ctaLabel: 'Review request',
      ctaUrl: '',
    })
    return { html, text: stripTags(html) }
  },
  mentorship_accepted: ({ mentorName }) => {
    const html = layout({
      title: 'Mentorship request accepted',
      body: `<p>${mentorName} accepted your mentorship request. You can now message each other to arrange a first conversation.</p>`,
    })
    return { html, text: stripTags(html) }
  },
  connection_request: ({ fromName, message }) => {
    const html = layout({
      title: 'New connection request',
      body: `<p>${fromName} would like to connect with you.</p>${message ? `<p>“${message}”</p>` : ''}`,
    })
    return { html, text: stripTags(html) }
  },
  connection_accepted: ({ withName }) => {
    const html = layout({
      title: 'Connection accepted',
      body: `<p>${withName} accepted your connection request. You can now message each other.</p>`,
    })
    return { html, text: stripTags(html) }
  },
  // `peerName` rather than `mentorName`: either participant may be the reader of
  // this mail, so naming the other side "the mentor" would be wrong for a mentor
  // reading about their own mentorship.
  mentorship_completed: ({ peerName }) => {
    const html = layout({
      title: 'Mentorship completed',
      body: `<p>Your mentorship with ${peerName} has been marked complete. Thank you both for taking part.</p>`,
    })
    return { html, text: stripTags(html) }
  },
  mentorship_declined: ({ mentorName, note }) => {
    const html = layout({
      title: 'Mentorship request declined',
      body: `<p>${mentorName} is not able to take on a mentorship right now.</p>${note ? `<p>“${note}”</p>` : ''}`,
    })
    return { html, text: stripTags(html) }
  },
  mentorship_ended: ({ peerName, reason }) => {
    const html = layout({
      title: 'Mentorship ended',
      body: `<p>The mentorship with ${peerName} has been closed.</p>${reason ? `<p>Reason: ${reason}</p>` : ''}`,
    })
    return { html, text: stripTags(html) }
  },
  event_rsvp: ({ eventTitle, eventDate, venue }) => {
    const html = layout({
      title: 'RSVP confirmed',
      body: `<p>You are registered for <strong>${eventTitle}</strong>.</p>
             <p>${eventDate}${venue ? ` at ${venue}` : ''}</p>`,
    })
    return { html, text: stripTags(html) }
  },
  event_reminder: ({ eventTitle, eventDate, venue, virtualUrl }) => {
    const html = layout({
      title: 'Event tomorrow',
      body: `<p>A reminder that <strong>${eventTitle}</strong> is coming up.</p>
             <p>${eventDate}${venue ? ` at ${venue}` : ''}</p>
             ${virtualUrl ? `<p>Join link: <a href="${virtualUrl}">${virtualUrl}</a></p>` : ''}`,
    })
    return { html, text: stripTags(html) }
  },
  event_cancelled: ({ eventTitle, reason }) => {
    const html = layout({
      title: 'Event cancelled',
      body: `<p><strong>${eventTitle}</strong> has been cancelled.</p>${reason ? `<p>${reason}</p>` : ''}`,
    })
    return { html, text: stripTags(html) }
  },
  job_application_update: ({ jobTitle, status }) => {
    const html = layout({
      title: 'Application update',
      body: `<p>Your application for <strong>${jobTitle}</strong> is now <strong>${status.replace('_', ' ')}</strong>.</p>`,
    })
    return { html, text: stripTags(html) }
  },
  donation_receipt: ({ amount, currency, receiptNumber, purpose }) => {
    const html = layout({
      title: 'Thank you for your donation',
      body: `<p>We received your donation of <strong>${amount} ${currency}</strong>.</p>
             <p>Receipt number: <strong>${receiptNumber}</strong></p>
             ${purpose ? `<p>Purpose: ${purpose}</p>` : ''}`,
      footer: 'No card details are stored on our systems.',
    })
    return { html, text: stripTags(html) }
  },
  account_suspended: ({ reason }) => {
    const html = layout({
      title: 'Account suspended',
      body: `<p>Your account has been suspended by an administrator.</p><p>Reason: ${reason}</p>`,
    })
    return { html, text: stripTags(html) }
  },
}

export function buildTemplate(name, payload) {
  const template = TEMPLATES[name]
  if (!template) {
    return {
      html: layout({ title: 'Alumni Network Portal', body: '<p>Notification</p>' }),
      text: 'Alumni Network Portal notification',
    }
  }
  return template(payload)
}

export { TEMPLATES }
