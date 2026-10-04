import { retryOnUniqueConflict } from './retry-on-conflict.helper';
import { Prisma } from '../../generated/prisma/client.js';

function conflictError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('retryOnUniqueConflict', () => {
  it('returns the result on the first successful call', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retryOnUniqueConflict(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a P2002 conflict and succeeds on a later attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValueOnce('ok after retry');

    await expect(retryOnUniqueConflict(fn)).resolves.toBe('ok after retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of attempts and rethrows', async () => {
    const fn = jest.fn().mockRejectedValue(conflictError());

    await expect(retryOnUniqueConflict(fn, 2)).rejects.toThrow(
      'Unique constraint failed',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows immediately for a non-conflict error, without retrying', async () => {
    const error = new Error('something else broke');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryOnUniqueConflict(fn, 3)).rejects.toThrow(
      'something else broke',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
