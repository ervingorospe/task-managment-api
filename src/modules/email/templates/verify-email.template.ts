export interface VerifyEmailParams {
  firstName: string;
  /** Backend link (not a frontend route) — GET /auth/verify-email?token=...
   * verifies and redirects the browser into the app itself, so this is
   * clicked directly rather than landing on a frontend page first. */
  verifyUrl: string;
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

/** Same table-based, fully-inlined-styles approach as
 * member-invite.template.ts, for the same email-client-compatibility
 * reasons — see that file's header comment. */
export function renderVerifyEmail(params: VerifyEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, verifyUrl } = params;

  const subject = 'Verify your email address';

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
                <h1 style="margin:0;font:600 20px/1.4 Arial,Helvetica,sans-serif;color:${COLORS.ink};">
                  Verify your email
                </h1>
                <p style="margin:12px 0 0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">
                  Hi ${firstName}, click below to confirm your email address and finish setting up your account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${COLORS.accent};">
                      <a href="${verifyUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font:600 14px Arial,Helvetica,sans-serif;color:${COLORS.ink};text-decoration:none;">
                        Verify email
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};word-break:break-all;">
                  Or copy this link into your browser:<br />
                  <a href="${verifyUrl}" target="_blank" style="color:${COLORS.accentHover};">${verifyUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid ${COLORS.line};">
                <p style="margin:0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${COLORS.inkMuted};">
                  If you didn't create this account, you can safely ignore this email.
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
    `Hi ${firstName}, verify your email address to finish setting up your account.`,
    '',
    `Verify: ${verifyUrl}`,
    '',
    "If you didn't create this account, you can safely ignore this email.",
  ].join('\n');

  return { subject, html, text };
}
