import { plainToInstance } from 'class-transformer';
import { AllRequestsQueryDto } from './all-requests-query.dto';

describe('AllRequestsQueryDto', () => {
  it('coerces orgId and involvesUserId to numbers', () => {
    const instance = plainToInstance(AllRequestsQueryDto, {
      orgId: '5',
      involvesUserId: '7',
    });
    expect(instance.orgId).toBe(5);
    expect(instance.involvesUserId).toBe(7);
  });
});
