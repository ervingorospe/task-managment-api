import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectDto } from './update-project.dto';

describe('UpdateProjectDto', () => {
  it('coerces assigneeIds entries to numbers', () => {
    const instance = plainToInstance(UpdateProjectDto, {
      assigneeIds: ['3'],
    });
    expect(instance.assigneeIds).toEqual([3]);
  });

  it('allows clientId to be explicitly null (clears the client), without validation error', async () => {
    const instance = plainToInstance(UpdateProjectDto, { clientId: null });
    expect(instance.clientId).toBeNull();
    const errors = await validate(instance);
    expect(errors).toHaveLength(0);
  });

  it('still validates clientId when given a real value', async () => {
    const instance = plainToInstance(UpdateProjectDto, {
      clientId: 'not-a-number',
    });
    const errors = await validate(instance);
    expect(errors.map((e) => e.property)).toEqual(['clientId']);
  });
});
