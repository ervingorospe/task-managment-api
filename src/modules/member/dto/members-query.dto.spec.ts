import { plainToInstance } from 'class-transformer';
import { MembersQueryDto } from './members-query.dto';

describe('MembersQueryDto', () => {
  it('coerces orgId to a number', () => {
    const instance = plainToInstance(MembersQueryDto, { orgId: '5' });
    expect(instance.orgId).toBe(5);
  });
});
