import { plainToInstance } from 'class-transformer';
import { LogActivityDto } from './log-activity.dto';

describe('LogActivityDto', () => {
  it('coerces involvedUserIds entries to numbers', () => {
    const instance = plainToInstance(LogActivityDto, {
      module: 'TICKET',
      action: 'create',
      entityId: 1,
      entityLabel: 'Ticket #1',
      actorId: 7,
      actorName: 'Jane',
      involvedUserIds: ['1', '2'],
      description: 'Created a ticket',
    });
    expect(instance.involvedUserIds).toEqual([1, 2]);
  });
});
