import { renderMemberInviteEmail } from './member-invite.template';

const BASE = {
  organizationName: 'Acme Studio',
  inviterName: 'Jane Doe',
  roleName: 'Member',
  acceptUrl: 'https://app.example.com/accept-invite?token=abc123',
};

describe('renderMemberInviteEmail', () => {
  it('builds the subject from the inviter and org names', () => {
    const result = renderMemberInviteEmail(BASE);
    expect(result.subject).toBe('Jane Doe invited you to join Acme Studio');
  });

  it('uses an initial-letter avatar block when no logo is given', () => {
    const result = renderMemberInviteEmail(BASE);
    expect(result.html).not.toContain('<img');
    expect(result.html).toContain('>A<');
  });

  it('uses an <img> logo block when a logo url is given', () => {
    const result = renderMemberInviteEmail({
      ...BASE,
      organizationLogo: 'https://cdn.example.com/logo.png',
    });
    expect(result.html).toContain(
      '<img src="https://cdn.example.com/logo.png"',
    );
  });

  it('omits the expiry line entirely when expiresAt is not set', () => {
    const result = renderMemberInviteEmail(BASE);
    expect(result.html).not.toContain('This invite expires on');
    expect(result.text).not.toContain('This invite expires on');
  });

  it('includes a formatted expiry line when expiresAt is set', () => {
    const result = renderMemberInviteEmail({
      ...BASE,
      expiresAt: new Date('2026-03-15T00:00:00.000Z'),
    });
    expect(result.html).toContain(
      'This invite expires on Sunday, March 15, 2026.',
    );
    expect(result.text).toContain(
      'This invite expires on Sunday, March 15, 2026.',
    );
  });

  it('includes the accept link and role in the plain-text body', () => {
    const result = renderMemberInviteEmail(BASE);
    expect(result.text).toContain(
      'Jane Doe invited you to join Acme Studio as a Member.',
    );
    expect(result.text).toContain(`Accept your invite: ${BASE.acceptUrl}`);
  });
});
