import { TicketRequestController } from './ticket-request.controller';
import type { TicketRequestService } from './ticket-request.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    list: jest.fn(),
    allForOrg: jest.fn(),
    create: jest.fn(),
    details: jest.fn(),
    update: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    approve: jest.fn(),
  } as unknown as TicketRequestService;
}

describe('TicketRequestController', () => {
  it('delegates list() with the query', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const query = { orgId: 5 } as never;

    void controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates all() with orgId and involvesUserId', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const query = { orgId: 5, involvesUserId: 7 } as never;

    void controller.all(query);
    expect(service.allForOrg).toHaveBeenCalledWith(5, 7);
  });

  it('delegates create() with orgId, the caller id, and the dto', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const dto = { title: 'Help' } as never;

    void controller.create(5, USER, dto);
    expect(service.create).toHaveBeenCalledWith(5, 7, dto);
  });

  it('delegates details() with requestId', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);

    void controller.details(1);
    expect(service.details).toHaveBeenCalledWith(1);
  });

  it('delegates update() with requestId, the caller id, and the dto', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const dto = { title: 'New' } as never;

    void controller.update(1, USER, dto);
    expect(service.update).toHaveBeenCalledWith(1, 7, dto);
  });

  it('delegates reject() with requestId and the dto', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const dto = { remarks: 'No' } as never;

    void controller.reject(1, dto);
    expect(service.reject).toHaveBeenCalledWith(1, dto);
  });

  it('delegates cancel() with requestId and the caller id', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);

    void controller.cancel(1, USER);
    expect(service.cancel).toHaveBeenCalledWith(1, 7);
  });

  it('delegates approve() with requestId and the dto', () => {
    const service = makeService();
    const controller = new TicketRequestController(service);
    const dto = { tagId: 2 } as never;

    void controller.approve(1, dto);
    expect(service.approve).toHaveBeenCalledWith(1, dto);
  });
});
