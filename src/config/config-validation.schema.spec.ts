import { configValidationSchema } from './config-validation.schema';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://localhost/test',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
  JWT_SECRET: 'secret',
};

describe('configValidationSchema', () => {
  it('passes with just the required variables set', () => {
    const { error, value } = configValidationSchema.validate(REQUIRED_ENV);
    expect(error).toBeUndefined();
    expect(value.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL);
  });

  it('defaults PORT to 3001 when unset', () => {
    const { error, value } = configValidationSchema.validate(REQUIRED_ENV);
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3001);
  });

  it('keeps an explicit PORT value', () => {
    const { value } = configValidationSchema.validate({
      ...REQUIRED_ENV,
      PORT: '4000',
    });
    expect(value.PORT).toBe(4000);
  });

  it.each([
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'JWT_SECRET',
  ])('fails when %s is missing', (key) => {
    const env = { ...REQUIRED_ENV };
    delete (env as Record<string, unknown>)[key];

    const { error } = configValidationSchema.validate(env);
    expect(error).toBeDefined();
    expect(error?.message).toContain(key);
  });

  it('allows AWS/SMTP/frontend vars to be entirely absent', () => {
    const { error } = configValidationSchema.validate(REQUIRED_ENV);
    expect(error).toBeUndefined();
  });

  it('allows AWS/SMTP vars to be present but blank', () => {
    const { error } = configValidationSchema.validate({
      ...REQUIRED_ENV,
      AWS_REGION: '',
      AWS_S3_BUCKET: '',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      FRONTEND_URL: '',
      BACKEND_URL: '',
    });
    expect(error).toBeUndefined();
  });
});
