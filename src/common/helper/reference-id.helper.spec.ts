import { formatReferenceId } from './reference-id.helper';

describe('formatReferenceId', () => {
  it('formats the first ticket as 1, zero-padded to 5 digits', () => {
    expect(formatReferenceId('tckt', 0)).toBe('tckt-00001');
  });

  it('formats a request prefix the same way', () => {
    expect(formatReferenceId('req', 0)).toBe('req-00001');
  });

  it('increments from an existing count', () => {
    expect(formatReferenceId('tckt', 41)).toBe('tckt-00042');
  });

  it('does not truncate once the count exceeds 5 digits', () => {
    expect(formatReferenceId('tckt', 99999)).toBe('tckt-100000');
  });
});
