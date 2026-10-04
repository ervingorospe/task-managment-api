import { renderInviteResponseEmail } from './invite-response.template';

const BASE = {
  organizationName: 'Acme Studio',
  inviteeName: 'Jane Doe',
  inviteeEmail: 'jane@example.com',
  roleName: 'Member',
};

describe('renderInviteResponseEmail', () => {
  it('builds an "accepted" subject and text', () => {
    const result = renderInviteResponseEmail({ ...BASE, status: 'ACCEPTED' });
    expect(result.subject).toBe(
      'Jane Doe accepted their invite to Acme Studio',
    );
    expect(result.text).toBe(
      'jane@example.com accepted the invite to join Acme Studio as a Member.',
    );
  });

  it('builds a "declined" subject and text', () => {
    const result = renderInviteResponseEmail({ ...BASE, status: 'REJECTED' });
    expect(result.subject).toBe(
      'Jane Doe declined their invite to Acme Studio',
    );
    expect(result.text).toBe(
      'jane@example.com declined the invite to join Acme Studio as a Member.',
    );
  });

  it('includes the "Accepted" badge text in the html for an acceptance', () => {
    const result = renderInviteResponseEmail({ ...BASE, status: 'ACCEPTED' });
    expect(result.html).toContain('Accepted');
    expect(result.html).toContain('jane@example.com');
    expect(result.html).toContain('Acme Studio');
  });

  it('includes the "Declined" badge text in the html for a rejection', () => {
    const result = renderInviteResponseEmail({ ...BASE, status: 'REJECTED' });
    expect(result.html).toContain('Declined');
  });
});
