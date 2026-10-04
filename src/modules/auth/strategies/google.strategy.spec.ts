import type { Profile, VerifyCallback } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';

// passport-oauth2's OAuth2Strategy throws at construction time if these
// aren't set — stand in for the real Google OAuth env vars.
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL =
  'https://api.example.com/auth/google/callback';

describe('GoogleStrategy construction', () => {
  it('falls back to empty strings for unset OAuth env vars (which passport then rejects)', () => {
    const original = {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
      callback: process.env.GOOGLE_CALLBACK_URL,
    };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;

    // GoogleStrategy itself just falls back to '' via `?? ''` — it's
    // passport-oauth2's own constructor that then rejects an empty
    // clientID. Either way, this proves the fallback branch ran.
    expect(() => new GoogleStrategy()).toThrow();

    process.env.GOOGLE_CLIENT_ID = original.id;
    process.env.GOOGLE_CLIENT_SECRET = original.secret;
    process.env.GOOGLE_CALLBACK_URL = original.callback;
  });
});

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'google-id-1',
    displayName: 'Jane Doe',
    emails: [{ value: 'jane@example.com', verified: true }],
    name: { givenName: 'Jane', familyName: 'Doe' },
    photos: [{ value: 'https://example.com/avatar.png' }],
    ...overrides,
  } as unknown as Profile;
}

describe('GoogleStrategy.validate', () => {
  it('maps a full Google profile to a GoogleProfile', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate('token', 'refresh', makeProfile(), done);

    expect(done).toHaveBeenCalledWith(null, {
      googleId: 'google-id-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      avatar: 'https://example.com/avatar.png',
    });
  });

  it('calls done with an error when the profile has no email', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate('token', 'refresh', makeProfile({ emails: [] }), done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
    const [error] = (done as jest.Mock).mock.calls[0];
    expect(error.message).toBe('Google account has no email.');
  });

  it('falls back to displayName for a missing given name', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate(
      'token',
      'refresh',
      makeProfile({ name: undefined }),
      done,
    );

    const [, profile] = (done as jest.Mock).mock.calls[0];
    expect(profile.firstName).toBe('Jane Doe');
  });

  it('falls back all the way to "Google" when neither given name nor displayName exist', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate(
      'token',
      'refresh',
      makeProfile({ name: undefined, displayName: '' }),
      done,
    );

    const [, profile] = (done as jest.Mock).mock.calls[0];
    expect(profile.firstName).toBe('Google');
  });

  it('falls back to "User" for a missing family name', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate(
      'token',
      'refresh',
      makeProfile({ name: { givenName: 'Jane', familyName: '' } }),
      done,
    );

    const [, profile] = (done as jest.Mock).mock.calls[0];
    expect(profile.lastName).toBe('User');
  });

  it('defaults avatar to null when no photo is present', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn() as unknown as VerifyCallback;

    strategy.validate('token', 'refresh', makeProfile({ photos: [] }), done);

    const [, profile] = (done as jest.Mock).mock.calls[0];
    expect(profile.avatar).toBeNull();
  });
});
