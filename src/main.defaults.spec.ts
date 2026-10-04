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

describe('bootstrap (main.ts) with FRONTEND_URL/PORT unset', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalPort = process.env.PORT;

  beforeAll(async () => {
    delete process.env.FRONTEND_URL;
    delete process.env.PORT;
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

  it('falls back to localhost:3000 for CORS', () => {
    expect(mockApp().enableCors).toHaveBeenCalledWith({
      origin: 'http://localhost:3000',
      credentials: true,
    });
  });

  it('falls back to port 3001', () => {
    expect(mockApp().listen).toHaveBeenCalledWith(3001);
  });
});
