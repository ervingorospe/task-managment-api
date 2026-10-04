import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public', () => {
  it('sets the isPublic metadata to true on the handler', () => {
    class TestController {
      @Public()
      handler() {}
    }

    const reflector = new Reflector();
    const value = reflector.get(
      IS_PUBLIC_KEY,
      TestController.prototype.handler,
    );
    expect(value).toBe(true);
  });
});
