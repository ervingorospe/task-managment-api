import { renderVerifyEmail } from './verify-email.template';

describe('renderVerifyEmail', () => {
  const result = renderVerifyEmail({
    firstName: 'Jane',
    verifyUrl: 'https://api.example.com/auth/verify-email?token=abc123',
  });

  it('has a fixed subject', () => {
    expect(result.subject).toBe('Verify your email address');
  });

  it('greets the recipient by first name in the html', () => {
    expect(result.html).toContain('Hi Jane,');
  });

  it('includes the verify link in the html, both as the button href and the plain copy link', () => {
    const occurrences =
      result.html.split(
        'https://api.example.com/auth/verify-email?token=abc123',
      ).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('includes the greeting and link in the plain-text body', () => {
    expect(result.text).toContain('Hi Jane,');
    expect(result.text).toContain(
      'Verify: https://api.example.com/auth/verify-email?token=abc123',
    );
  });
});
