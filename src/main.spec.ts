import { ValidationPipe, VersioningType } from '@nestjs/common';

jest.mock('@nestjs/core', () => {
  const mockApp = {
    enableVersioning: jest.fn(),
    enableCors: jest.fn(),
    use: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
  };
  return {
    NestFactory: { create: jest.fn().mockResolvedValue(mockApp) },
    __mockApp: mockApp,
  };
});

jest.mock('cookie-parser', () => jest.fn(() => 'cookie-parser-middleware'));

describe('bootstrap (main.ts) with FRONTEND_URL/PORT set', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalPort = process.env.PORT;

  beforeAll(async () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.PORT = '4000';
    require('./main');
    await new Promise((resolve) => setImmediate(resolve));
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.PORT = originalPort;
  });

  function mockApp() {
    return (
      jest.requireMock('@nestjs/core') as {
        __mockApp: Record<string, jest.Mock>;
      }
    ).__mockApp;
  }

  it('enables URI versioning defaulting to v1', () => {
    expect(mockApp().enableVersioning).toHaveBeenCalledWith({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
  });

  it('enables CORS for FRONTEND_URL with credentials', () => {
    expect(mockApp().enableCors).toHaveBeenCalledWith({
      origin: 'https://app.example.com',
      credentials: true,
    });
  });

  it('registers cookie-parser middleware', () => {
    expect(mockApp().use).toHaveBeenCalledWith('cookie-parser-middleware');
  });

  it('registers a whitelisting, transforming ValidationPipe', () => {
    expect(mockApp().useGlobalPipes).toHaveBeenCalledWith(
      expect.any(ValidationPipe),
    );
  });

  it('registers the global exception filter', () => {
    expect(mockApp().useGlobalFilters).toHaveBeenCalled();
  });

  it('listens on the configured PORT', () => {
    expect(mockApp().listen).toHaveBeenCalledWith('4000');
  });
});
