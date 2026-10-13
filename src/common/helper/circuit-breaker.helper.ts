import { Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';

export interface CircuitBreakerOptions {
  /** A call is treated as failed if it takes longer than this, in ms. */
  timeout?: number;
  /** Minimum number of calls within the rolling window before the breaker
   * will even consider tripping — avoids opening on e.g. one failed call
   * out of one attempt. */
  volumeThreshold?: number;
  /** % of calls within the window that must fail to trip the breaker
   * open. opossum compares with a strict `>`, so 100 can never actually
   * trip (a 100% failure rate is never "> 100") — 99 is effectively "all
   * of them" while still being reachable, closer to a plain
   * N-failures-in-a-row breaker than opossum's percentage-based default
   * of 50. */
  errorThresholdPercentage?: number;
  /** The rolling window the two settings above are measured over, in ms. */
  rollingCountTimeout?: number;
  /** How long the breaker stays open (failing fast, not calling the
   * dependency at all) before letting one trial call through. */
  resetTimeout?: number;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  timeout: 5000,
  volumeThreshold: 3,
  errorThresholdPercentage: 99,
  rollingCountTimeout: 10000,
  resetTimeout: 30000,
};

/**
 * Wraps an async call to an external dependency (SendGrid, S3, ...) so
 * repeated failures make it fail fast instead of piling up slow timeouts
 * — see this app's own notes on mail-provider outages for why this
 * matters here. Not for calls to our own database; only for dependencies
 * we don't control and that can legitimately be down independently of us.
 */
export function createCircuitBreaker<Args extends unknown[], R>(
  name: string,
  action: (...args: Args) => Promise<R>,
  options: CircuitBreakerOptions = {},
): CircuitBreaker<Args, R> {
  const logger = new Logger(`CircuitBreaker:${name}`);
  const resolved = { ...DEFAULTS, ...options };

  const breaker = new CircuitBreaker(action, {
    ...resolved,
    name,
  });

  breaker.on('open', () =>
    logger.warn(`Circuit opened — failing fast for ${resolved.resetTimeout}ms`),
  );
  breaker.on('halfOpen', () =>
    logger.log('Circuit half-open — testing with the next call'),
  );
  breaker.on('close', () =>
    logger.log('Circuit closed — calls flowing normally again'),
  );

  return breaker;
}
