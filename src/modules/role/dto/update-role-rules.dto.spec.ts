import { plainToInstance } from 'class-transformer';
import { UpdateRoleRulesDto } from './update-role-rules.dto';

describe('UpdateRoleRulesDto', () => {
  it('transforms rules into nested RuleRefDto instances', () => {
    const instance = plainToInstance(UpdateRoleRulesDto, {
      rules: [{ id: 3 }],
    });
    expect(instance.rules[0].id).toBe(3);
  });
});
