export interface InviteResponseEmailParams {
  /** Org the invite was for. */
  organizationName: string;
  /** Best-effort display name for the invitee — falls back to their email
   * when no name was ever collected (e.g. they declined before setting one). */
  inviteeName: string;
  inviteeEmail: string;
  /** The role the invite offered, e.g. "Member", "Admin". */
  roleName: string;
  status: 'ACCEPTED' | 'REJECTED';
}

const COLORS = {
  accent: '#32CD32',
  accentHover: '#28A428',
  accentSubtle: '#E9F7E9',
  danger: '#D64545',
  dangerSubtle: '#FBEAEA',
  ink: '#0E241C',
  inkMuted: '#5B6B65',
  line: '#DCE3E0',
  canvas: '#F7F8F7',
  surface: '#FFFFFF',
};

/** Same table-based, fully-inlined-styles approach as
 * member-invite.template.ts, for the same email-client-compatibility
 * reasons — see that file's header comment. Sent to the organization owner
 * and whoever sent/resent the invite once the invitee responds to it. */
export function renderInviteResponseEmail(params: InviteResponseEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { organizationName, inviteeName, inviteeEmail, roleName, status } =
    params;

  const accepted = status === 'ACCEPTED';
  const verb = accepted ? 'accepted' : 'declined';
  const badgeColor = accepted ? COLORS.accent : COLORS.danger;
  const badgeBg = accepted ? COLORS.accentSubtle : COLORS.dangerSubtle;

  const subject = `${inviteeName} ${verb} their invite to ${organizationName}`;

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
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${badgeBg};color:${badgeColor};font:600 11px Arial,Helvetica,sans-serif;letter-spacing:0.04em;text-transform:uppercase;">
                  ${accepted ? 'Accepted' : 'Declined'}
                </span>
                <h1 style="margin:16px 0 0;font:600 20px/1.4 Arial,Helvetica,sans-serif;color:${COLORS.ink};">
                  ${inviteeName} ${verb} their invite
                </h1>
                <p style="margin:12px 0 0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">
                  <strong style="color:${COLORS.ink};">${inviteeEmail}</strong> ${verb} the invite to join
                  <strong style="color:${COLORS.ink};">${organizationName}</strong> as a
                  <strong style="color:${COLORS.ink};">${roleName}</strong>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${inviteeEmail} ${verb} the invite to join ${organizationName} as a ${roleName}.`;

  return { subject, html, text };
}
