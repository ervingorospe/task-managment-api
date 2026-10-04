import { plainToInstance } from 'class-transformer';
import { CreateRoleDto } from './create-role.dto';

describe('CreateRoleDto', () => {
  it('transforms rules into nested RuleRefDto instances', () => {
    const instance = plainToInstance(CreateRoleDto, {
      roleName: 'Manager',
      rules: [{ id: 1 }, { id: 2 }],
    });
    expect(instance.rules).toHaveLength(2);
    expect(instance.rules[0].id).toBe(1);
  });
});
