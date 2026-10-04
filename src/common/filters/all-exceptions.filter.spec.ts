import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { Prisma } from '../../generated/prisma/client.js';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('maps a built-in NestJS exception, which structures its own response body', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new NotFoundException('Ticket not found.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'Ticket not found.',
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('maps a raw HttpException given just a plain string, using the class name as "error"', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new HttpException('a plain string body', 418), host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({
      statusCode: 418,
      error: 'HttpException',
      message: 'a plain string body',
    });
  });

  it('maps an HttpException with an object response body, preferring its own error/message', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new BadRequestException(['field is required']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['field is required'],
      }),
    );
  });

  it("falls back to the exception's own name/message when its object payload omits them", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new HttpException({ foo: 'bar' }, 400), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'HttpException',
        message: 'Http Exception',
      }),
    );
  });

  it('passes through a machine-readable "code" when the exception payload carries one', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(
      new ForbiddenException({
        message: 'Please verify your email.',
        code: 'UNVERIFIED',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNVERIFIED' }),
    );
  });

  it('omits "code" when the payload does not carry one', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(new NotFoundException('Ticket not found.'), host);

    expect(json.mock.calls[0][0]).not.toHaveProperty('code');
  });

  it('logs 5xx HttpExceptions as errors, with the stack', () => {
    const filter = new AllExceptionsFilter();
    const { host } = makeHost();

    filter.catch(
      new HttpException('boom', HttpStatus.INTERNAL_SERVER_ERROR),
      host,
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['P2002', 409, 'Conflict'],
    ['P2025', 404, 'Not Found'],
    ['P2003', 400, 'Bad Request'],
    ['P2018', 400, 'Bad Request'],
  ])('maps Prisma code %s to status %d', (code, status, error) => {
    const filter = new AllExceptionsFilter();
    const { host, status: statusFn, json } = makeHost();

    filter.catch(prismaError(code), host);

    expect(statusFn).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: status, error }),
    );
  });

  it('describePrismaError falls back to a generic message for a code with no case of its own', () => {
    // Unreachable through catch() itself — PRISMA_ERROR_MAP and this
    // switch cover the exact same codes — but the switch still needs a
    // defensive default, so it's exercised directly here.
    const filter = new AllExceptionsFilter() as unknown as {
      describePrismaError: (exception: unknown) => string;
    };

    expect(filter.describePrismaError(prismaError('P9999'))).toBe(
      'Something went wrong.',
    );
  });

  it('includes the conflicting field(s) in a P2002 message when meta.target is present', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(prismaError('P2002', { target: ['email'] }), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'A record with this email already exists.',
      }),
    );
  });

  it('falls back to a generic P2002 message when meta.target is absent', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    filter.catch(prismaError('P2002'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'This record already exists.' }),
    );
  });

  it('returns a generic 500 for an unmapped Prisma error code', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(prismaError('P2099'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something went wrong.' }),
    );
  });

  it('maps a PrismaClientValidationError to 400', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(
      new Prisma.PrismaClientValidationError('bad shape', {
        clientVersion: 'test',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid data sent to the database.',
      }),
    );
  });

  it('maps an arbitrary thrown Error to a generic 500, never leaking its message', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new Error('leaked internal detail'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  });

  it('maps a non-Error thrown value (e.g. a string) to a generic 500 too', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = makeHost();

    filter.catch('a raw string throw', host);

    expect(status).toHaveBeenCalledWith(500);
  });
});
