import { plainToInstance } from 'class-transformer';
import { TicketQueryDto } from './ticket-query.dto';

describe('TicketQueryDto', () => {
  it('coerces orgId/involvesUserId and normalizes array filters', () => {
    const instance = plainToInstance(TicketQueryDto, {
      orgId: '5',
      involvesUserId: '7',
      filterBy: 'overdue',
      memberIds: '1',
      projectIds: '2',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.involvesUserId).toBe(7);
    expect(instance.filterBy).toEqual(['overdue']);
    expect(instance.memberIds).toEqual([1]);
    expect(instance.projectIds).toEqual([2]);
  });
});
