import { plainToInstance } from 'class-transformer';
import { UpdateTicketAssigneesDto } from './update-ticket-assignees.dto';

describe('UpdateTicketAssigneesDto', () => {
  it('coerces assigneeIds entries to numbers', () => {
    const instance = plainToInstance(UpdateTicketAssigneesDto, {
      assigneeIds: ['4', '5'],
    });
    expect(instance.assigneeIds).toEqual([4, 5]);
  });
});
