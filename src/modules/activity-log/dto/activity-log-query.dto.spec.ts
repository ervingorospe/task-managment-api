import { plainToInstance } from 'class-transformer';
import { ActivityLogQueryDto } from './activity-log-query.dto';

describe('ActivityLogQueryDto', () => {
  it('coerces orgId and author ids to numbers, and normalizes module to an array', () => {
    const instance = plainToInstance(ActivityLogQueryDto, {
      orgId: '5',
      module: 'TICKET',
      author: '7',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.module).toEqual(['TICKET']);
    expect(instance.author).toEqual([7]);
  });
});
