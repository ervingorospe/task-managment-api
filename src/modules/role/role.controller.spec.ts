import { RoleController } from './role.controller';
import type { RoleService } from './role.service';

function makeService() {
  return {
    categories: jest.fn(),
    roles: jest.fn(),
    create: jest.fn(),
    updateRules: jest.fn(),
    updateInfo: jest.fn(),
    remove: jest.fn(),
  } as unknown as RoleService;
}

describe('RoleController', () => {
  it('delegates categories()', () => {
    const service = makeService();
    const controller = new RoleController(service);

    void controller.categories();
    expect(service.categories).toHaveBeenCalled();
  });

  it('delegates roles() with orgId', () => {
    const service = makeService();
    const controller = new RoleController(service);

    void controller.roles(5);
    expect(service.roles).toHaveBeenCalledWith(5);
  });

  it('delegates create() with orgId and the dto', () => {
    const service = makeService();
    const controller = new RoleController(service);
    const dto = { roleName: 'Manager', rules: [] } as never;

    void controller.create(5, dto);
    expect(service.create).toHaveBeenCalledWith(5, dto);
  });

  it('delegates updateRules() with roleId and the dto', () => {
    const service = makeService();
    const controller = new RoleController(service);
    const dto = { rules: [] } as never;

    void controller.updateRules(1, dto);
    expect(service.updateRules).toHaveBeenCalledWith(1, dto);
  });

  it('delegates updateInfo() with roleId and the dto', () => {
    const service = makeService();
    const controller = new RoleController(service);
    const dto = { roleName: 'New' } as never;

    void controller.updateInfo(1, dto);
    expect(service.updateInfo).toHaveBeenCalledWith(1, dto);
  });

  it('delegates remove() with roleId', () => {
    const service = makeService();
    const controller = new RoleController(service);

    void controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
