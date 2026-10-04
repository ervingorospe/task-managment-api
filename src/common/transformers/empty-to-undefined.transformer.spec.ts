import { plainToInstance } from 'class-transformer';
import { EmptyToUndefined } from './empty-to-undefined.transformer';

class TestDto {
  @EmptyToUndefined()
  email?: string;
}

describe('EmptyToUndefined', () => {
  it('normalizes an empty string to undefined', () => {
    const instance = plainToInstance(TestDto, { email: '' });
    expect(instance.email).toBeUndefined();
  });

  it('leaves a non-empty value untouched', () => {
    const instance = plainToInstance(TestDto, { email: 'a@b.com' });
    expect(instance.email).toBe('a@b.com');
  });

  it('leaves a missing field untouched', () => {
    const instance = plainToInstance(TestDto, {});
    expect(instance.email).toBeUndefined();
  });
});
