import { Logger } from '@nestjs/common';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      enableVersioning: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('cookie-parser', () => jest.fn(() => 'cookie-parser-middleware'));

describe('main.ts process-level safety nets', () => {
  let errorSpy: jest.SpyInstance;
  let onSpy: jest.SpyInstance;

  beforeAll(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    onSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    require('./main');
  });

  afterAll(() => {
    errorSpy.mockRestore();
    onSpy.mockRestore();
  });

  function handlerFor(event: string): (...args: unknown[]) => void {
    const call = onSpy.mock.calls.find((c) => c[0] === event);
    if (!call) throw new Error(`no process.on(${event}) handler registered`);
    return call[1] as (...args: unknown[]) => void;
  }

  it("logs an unhandled rejection's stack when the reason is an Error", () => {
    handlerFor('unhandledRejection')(new Error('boom'));

    expect(errorSpy).toHaveBeenCalledWith(
      'Unhandled promise rejection',
      expect.stringContaining('boom'),
    );
  });

  it('stringifies a non-Error rejection reason', () => {
    handlerFor('unhandledRejection')('plain string reason');

    expect(errorSpy).toHaveBeenCalledWith(
      'Unhandled promise rejection',
      'plain string reason',
    );
  });

  it("logs an uncaught exception's stack", () => {
    handlerFor('uncaughtException')(new Error('fatal'));

    expect(errorSpy).toHaveBeenCalledWith(
      'Uncaught exception',
      expect.stringContaining('fatal'),
    );
  });
});
