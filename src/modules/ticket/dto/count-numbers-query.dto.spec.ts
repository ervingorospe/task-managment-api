import { plainToInstance } from 'class-transformer';
import { CountNumbersQueryDto } from './count-numbers-query.dto';

describe('CountNumbersQueryDto', () => {
  it('coerces orgId/involvesUserId to numbers and normalizes array filters', () => {
    const instance = plainToInstance(CountNumbersQueryDto, {
      orgId: '5',
      involvesUserId: '7',
      filterBy: 'overdue',
      projectIds: '3',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.involvesUserId).toBe(7);
    expect(instance.filterBy).toEqual(['overdue']);
    expect(instance.projectIds).toEqual([3]);
  });
});
