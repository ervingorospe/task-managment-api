import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  RequirePermissions,
} from './require-permissions.decorator';
import { PERMISSIONS } from '../permissions/permissions.constant';

describe('RequirePermissions', () => {
  it('sets the full metadata object on the handler', () => {
    class TestController {
      @RequirePermissions({
        allOf: [PERMISSIONS.TAG_ADD],
        resource: 'param.orgId',
      })
      handler() {}
    }

    const reflector = new Reflector();
    const value = reflector.get(
      PERMISSIONS_KEY,
      TestController.prototype.handler,
    );
    expect(value).toEqual({
      allOf: [PERMISSIONS.TAG_ADD],
      resource: 'param.orgId',
    });
  });
});
