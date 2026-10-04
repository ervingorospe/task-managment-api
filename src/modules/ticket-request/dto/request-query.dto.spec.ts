import { plainToInstance } from 'class-transformer';
import { RequestQueryDto } from './request-query.dto';

describe('RequestQueryDto', () => {
  it('coerces orgId to a number and normalizes filterBy to an array', () => {
    const instance = plainToInstance(RequestQueryDto, {
      orgId: '5',
      filterBy: 'pending',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.filterBy).toEqual(['pending']);
  });
});
