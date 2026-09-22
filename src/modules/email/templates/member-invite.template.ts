export interface MemberInviteEmailParams {
  /** Org the recipient is being invited into. */
  organizationName: string;
  /** Public URL to the org's logo, if it has one set. */
  organizationLogo?: string | null;
  /** Full name of whoever sent the invite. */
  inviterName: string;
  /** The role they'd hold once they accept, e.g. "Member", "Admin". */
  roleName: string;
  /** Where the "Accept invite" button links — a frontend route carrying
   * the invite's token, once that route exists (see EmailModule's header
   * comment: nothing wires this up yet). */
  acceptUrl: string;
  /** When the invite stops being acceptable, if it has an expiry. */
  expiresAt?: Date | null;
}

const COLORS = {
  accent: '#32CD32',
  accentHover: '#28A428',
  accentSubtle: '#E9F7E9',
  ink: '#0E241C',
  inkMuted: '#5B6B65',
  line: '#DCE3E0',
  canvas: '#F7F8F7',
  surface: '#FFFFFF',
};

function formatExpiry(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Table-based layout with every style inlined — the two constraints any
 * marketing/transactional email HTML has to work around: most clients
 * (Outlook chief among them) ignore <style> blocks and modern CSS layout,
 * and images (here, the org logo) may be blocked by default, so nothing
 * critical to understanding the email can depend on them loading.
 */
export function renderMemberInviteEmail(params: MemberInviteEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    organizationName,
    organizationLogo,
    inviterName,
    roleName,
    acceptUrl,
    expiresAt,
  } = params;

  const subject = `${inviterName} invited you to join ${organizationName}`;

  const logoBlock = organizationLogo
    ? `<img src="${organizationLogo}" width="48" height="48" alt="${organizationName}" style="display:block;border-radius:8px;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:8px;background:${COLORS.accentSubtle};color:${COLORS.accentHover};font:600 18px Arial,Helvetica,sans-serif;line-height:48px;text-align:center;">${organizationName.charAt(0).toUpperCase()}</div>`;

  const expiryLine = expiresAt
    ? `<p style="margin:0 0 24px;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">This invite expires on ${formatExpiry(expiresAt)}.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.canvas};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 24px;">
                ${logoBlock}
                <h1 style="margin:20px 0 0;font:600 20px/1.4 Arial,Helvetica,sans-serif;color:${COLORS.ink};">
                  You've been invited to join ${organizationName}
                </h1>
                <p style="margin:12px 0 0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">
                  <strong style="color:${COLORS.ink};">${inviterName}</strong> invited you to join
                  <strong style="color:${COLORS.ink};">${organizationName}</strong> as a
                  <strong style="color:${COLORS.ink};">${roleName}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${COLORS.accent};">
                      <a href="${acceptUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font:600 14px Arial,Helvetica,sans-serif;color:${COLORS.ink};text-decoration:none;">
                        Accept invite
                      </a>
                    </td>
                  </tr>
                </table>
                ${expiryLine}
                <p style="margin:0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};word-break:break-all;">
                  Or copy this link into your browser:<br />
                  <a href="${acceptUrl}" target="_blank" style="color:${COLORS.accentHover};">${acceptUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid ${COLORS.line};">
                <p style="margin:0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">
                  If you weren't expecting this invite, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${inviterName} invited you to join ${organizationName} as a ${roleName}.`,
    '',
    `Accept your invite: ${acceptUrl}`,
    expiresAt ? `This invite expires on ${formatExpiry(expiresAt)}.` : '',
    '',
    "If you weren't expecting this invite, you can safely ignore this email.",
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}
