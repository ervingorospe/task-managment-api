import { ProjectController } from './project.controller';
import type { ProjectService } from './project.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    projects: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as ProjectService;
}

describe('ProjectController', () => {
  it('delegates projects() with orgId and the caller id', () => {
    const service = makeService();
    const controller = new ProjectController(service);

    void controller.projects(5, USER);
    expect(service.projects).toHaveBeenCalledWith(5, 7);
  });

  it('delegates findOne() with projectId and the caller id', () => {
    const service = makeService();
    const controller = new ProjectController(service);

    void controller.findOne(1, USER);
    expect(service.findOne).toHaveBeenCalledWith(1, 7);
  });

  it('delegates create() with orgId and the dto', () => {
    const service = makeService();
    const controller = new ProjectController(service);
    const dto = { name: 'Website' } as never;

    void controller.create(5, dto);
    expect(service.create).toHaveBeenCalledWith(5, dto);
  });

  it('delegates update() with projectId and the dto', () => {
    const service = makeService();
    const controller = new ProjectController(service);
    const dto = { name: 'New' } as never;

    void controller.update(1, dto);
    expect(service.update).toHaveBeenCalledWith(1, dto);
  });

  it('delegates remove() with projectId', () => {
    const service = makeService();
    const controller = new ProjectController(service);

    void controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
