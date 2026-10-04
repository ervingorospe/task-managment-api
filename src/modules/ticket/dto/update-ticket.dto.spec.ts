import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTicketDto } from './update-ticket.dto';

describe('UpdateTicketDto', () => {
  it('allows dueDate/projectId to be explicitly null (clears them)', async () => {
    const instance = plainToInstance(UpdateTicketDto, {
      dueDate: null,
      projectId: null,
    });
    const errors = await validate(instance);
    expect(errors).toHaveLength(0);
  });

  it('still validates dueDate/projectId when given a real value', async () => {
    const instance = plainToInstance(UpdateTicketDto, {
      dueDate: 'not-a-date',
      projectId: 'not-a-number',
    });
    const errors = await validate(instance);
    const properties = errors.map((e) => e.property).sort();
    expect(properties).toEqual(['dueDate', 'projectId']);
  });
});
