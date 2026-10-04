import { plainToInstance } from 'class-transformer';
import { ApproveRequestDto } from './approve-request.dto';

describe('ApproveRequestDto', () => {
  it('coerces assigneeIds entries to numbers', () => {
    const instance = plainToInstance(ApproveRequestDto, {
      tagId: 1,
      assigneeIds: ['2', '3'],
    });
    expect(instance.assigneeIds).toEqual([2, 3]);
  });
});
