import { Logger } from '@nestjs/common';
import { createCircuitBreaker } from './circuit-breaker.helper';

describe('createCircuitBreaker', () => {
  it('fires the wrapped action and resolves with its result', async () => {
    const action = jest.fn().mockResolvedValue('result');
    const breaker = createCircuitBreaker('test-breaker', action);

    await expect(breaker.fire()).resolves.toBe('result');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('passes arguments through to the wrapped action', async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    const breaker = createCircuitBreaker('test-breaker', action);

    await breaker.fire('a', 1);
    expect(action).toHaveBeenCalledWith('a', 1);
  });

  it('applies the default options when none are given', () => {
    const breaker = createCircuitBreaker('defaults', jest.fn());
    expect(breaker.options.timeout).toBe(5000);
    expect(breaker.options.volumeThreshold).toBe(3);
    expect(breaker.options.errorThresholdPercentage).toBe(99);
  });

  it('lets custom options override the defaults', () => {
    const breaker = createCircuitBreaker('custom', jest.fn(), {
      timeout: 1000,
    });
    expect(breaker.options.timeout).toBe(1000);
    // Untouched defaults still apply alongside the override.
    expect(breaker.options.volumeThreshold).toBe(3);
  });

  it('logs when the circuit opens, half-opens, and closes', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const breaker = createCircuitBreaker('events', jest.fn());

    breaker.emit('open');
    breaker.emit('halfOpen');
    breaker.emit('close');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Circuit opened'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('half-open'));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Circuit closed'),
    );

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});
