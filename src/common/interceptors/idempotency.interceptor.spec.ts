import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service';

function conflictError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeContext(options: {
  method: string;
  headers?: Record<string, unknown>;
  originalUrl?: string;
  url?: string;
}) {
  const response = { status: jest.fn(), statusCode: 201 };
  const request = {
    method: options.method,
    headers: options.headers ?? {},
    originalUrl: options.originalUrl,
    url: options.url ?? '/fallback',
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

function makeHandler(result: unknown) {
  return { handle: () => of(result) } as CallHandler;
}

describe('IdempotencyInterceptor', () => {
  it('passes non-mutating requests straight through, untouched', async () => {
    const findUnique = jest.fn();
    const prisma = {
      idempotencyKey: { findUnique },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({ method: 'GET' });

    const result = await interceptor.intercept(context, makeHandler('body'));
    await expect(firstValueFrom(result as Observable<unknown>)).resolves.toBe(
      'body',
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('runs a mutating request normally when no Idempotency-Key header is sent', async () => {
    const findUnique = jest.fn();
    const prisma = {
      idempotencyKey: { findUnique },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({ method: 'POST' });

    const result = await interceptor.intercept(context, makeHandler('body'));
    await expect(firstValueFrom(result as Observable<unknown>)).resolves.toBe(
      'body',
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('runs normally when the Idempotency-Key header is an array, not a string', async () => {
    const findUnique = jest.fn();
    const prisma = {
      idempotencyKey: { findUnique },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': ['a', 'b'] },
    });

    await interceptor.intercept(context, makeHandler('body'));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('replays the cached response for a key that already exists', async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({
          responseStatus: 201,
          responseBody: { id: 1 },
        }),
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context, response } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
    });

    const result = await interceptor.intercept(context, makeHandler('unused'));
    await expect(
      firstValueFrom(result as Observable<unknown>),
    ).resolves.toEqual({ id: 1 });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('throws ConflictException when claiming the key races a concurrent request', async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(conflictError()),
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
    });

    await expect(
      interceptor.intercept(context, makeHandler('unused')),
    ).rejects.toThrow(ConflictException);
  });

  it('rethrows a non-conflict error from claiming the key', async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
    });

    await expect(
      interceptor.intercept(context, makeHandler('unused')),
    ).rejects.toThrow('db down');
  });

  it('claims the key using originalUrl, falling back to url when unset', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      url: '/fallback-path',
    });

    await interceptor.intercept(context, makeHandler('body'));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ path: '/fallback-path' }),
      }),
    );
  });

  it('stores the handler result and returns it on success', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        update,
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context, response } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      originalUrl: '/things',
    });
    response.statusCode = 201;

    const result = await interceptor.intercept(context, makeHandler({ id: 1 }));
    await expect(
      firstValueFrom(result as Observable<unknown>),
    ).resolves.toEqual({ id: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { key: 'key-1' },
      data: { responseStatus: 201, responseBody: { id: 1 } },
    });
  });

  it('stores Prisma.JsonNull when the handler returns undefined', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        update,
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'DELETE',
      headers: { 'idempotency-key': 'key-1' },
      originalUrl: '/things/1',
    });

    await interceptor.intercept(context, makeHandler(undefined));
    expect(update).toHaveBeenCalledWith({
      where: { key: 'key-1' },
      data: { responseStatus: 201, responseBody: Prisma.JsonNull },
    });
  });

  it('deletes the claimed key and rethrows when the handler itself fails', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        delete: del,
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      originalUrl: '/things',
    });

    const failingHandler: CallHandler = {
      handle: () => {
        throw new Error('handler blew up');
      },
    };

    await expect(
      interceptor.intercept(context, failingHandler),
    ).rejects.toThrow('handler blew up');
    expect(del).toHaveBeenCalledWith({ where: { key: 'key-1' } });
  });

  it('swallows a failure while cleaning up the claimed key after a handler error', async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockRejectedValue(new Error('cleanup failed too')),
      },
    } as unknown as PrismaService;
    const interceptor = new IdempotencyInterceptor(prisma);
    const { context } = makeContext({
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      originalUrl: '/things',
    });

    const failingHandler: CallHandler = {
      handle: () => {
        throw new Error('original failure');
      },
    };

    await expect(
      interceptor.intercept(context, failingHandler),
    ).rejects.toThrow('original failure');
  });
});
