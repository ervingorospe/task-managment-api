import { plainToInstance } from 'class-transformer';
import { AllTicketsQueryDto } from './all-tickets-query.dto';

describe('AllTicketsQueryDto', () => {
  it('coerces orgId and involvesUserId to numbers', () => {
    const instance = plainToInstance(AllTicketsQueryDto, {
      orgId: '5',
      involvesUserId: '7',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.involvesUserId).toBe(7);
  });
});
