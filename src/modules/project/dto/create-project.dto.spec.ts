import { plainToInstance } from 'class-transformer';
import { CreateProjectDto } from './create-project.dto';

describe('CreateProjectDto', () => {
  it('coerces assigneeIds entries to numbers', () => {
    const instance = plainToInstance(CreateProjectDto, {
      name: 'Website',
      assigneeIds: ['1', '2'],
    });
    expect(instance.assigneeIds).toEqual([1, 2]);
  });
});
