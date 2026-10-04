import { TicketController } from './ticket.controller';
import type { TicketService } from './ticket.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    countNumbers: jest.fn(),
    recent: jest.fn(),
    allForOrg: jest.fn(),
    countNumbersPersonal: jest.fn(),
    allForOwner: jest.fn(),
    listPersonal: jest.fn(),
    createPersonal: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    details: jest.fn(),
    update: jest.fn(),
    updateTag: jest.fn(),
    updateAssignees: jest.fn(),
    updateStar: jest.fn(),
    remove: jest.fn(),
    addAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    addComment: jest.fn(),
    updateComment: jest.fn(),
    removeComment: jest.fn(),
  } as unknown as TicketService;
}

describe('TicketController', () => {
  it('delegates countNumbers() with the query', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const query = { orgId: 5 } as never;

    void controller.countNumbers(query);
    expect(service.countNumbers).toHaveBeenCalledWith(query);
  });

  it('delegates recent() with orgId', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.recent(5);
    expect(service.recent).toHaveBeenCalledWith(5);
  });

  it('delegates all() with orgId and involvesUserId', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const query = { orgId: 5, involvesUserId: 7 } as never;

    void controller.all(query);
    expect(service.allForOrg).toHaveBeenCalledWith(5, 7);
  });

  it('delegates countNumbersPersonal() with the caller id', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const query = {} as never;

    void controller.countNumbersPersonal(USER, query);
    expect(service.countNumbersPersonal).toHaveBeenCalledWith(7, query);
  });

  it('delegates allPersonal() with the caller id', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.allPersonal(USER);
    expect(service.allForOwner).toHaveBeenCalledWith(7);
  });

  it('delegates listPersonal() with the caller id and query', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const query = {} as never;

    void controller.listPersonal(USER, query);
    expect(service.listPersonal).toHaveBeenCalledWith(7, query);
  });

  it('delegates createPersonal() with the caller id and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { title: 'Task' } as never;

    void controller.createPersonal(USER, dto);
    expect(service.createPersonal).toHaveBeenCalledWith(7, dto);
  });

  it('delegates list() with the query', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const query = { orgId: 5 } as never;

    void controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('delegates create() with orgId and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { title: 'Bug' } as never;

    void controller.create(5, dto);
    expect(service.create).toHaveBeenCalledWith(5, dto);
  });

  it('delegates details() with ticketId', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.details(1);
    expect(service.details).toHaveBeenCalledWith(1);
  });

  it('delegates update() with ticketId and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { title: 'New' } as never;

    void controller.update(1, dto);
    expect(service.update).toHaveBeenCalledWith(1, dto);
  });

  it('delegates updateTag() with ticketId and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { tagId: 2 } as never;

    void controller.updateTag(1, dto);
    expect(service.updateTag).toHaveBeenCalledWith(1, dto);
  });

  it('delegates updateAssignees() with ticketId and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { assigneeIds: [1] } as never;

    void controller.updateAssignees(1, dto);
    expect(service.updateAssignees).toHaveBeenCalledWith(1, dto);
  });

  it('delegates updateStar() with ticketId and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { starred: true } as never;

    void controller.updateStar(1, dto);
    expect(service.updateStar).toHaveBeenCalledWith(1, dto);
  });

  it('delegates remove() with ticketId', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });

  it('delegates addAttachment() with ticketId and file', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const file = {} as Express.Multer.File;

    void controller.addAttachment(1, file);
    expect(service.addAttachment).toHaveBeenCalledWith(1, file);
  });

  it('delegates removeAttachment() with attachmentId', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.removeAttachment(2);
    expect(service.removeAttachment).toHaveBeenCalledWith(2);
  });

  it('delegates addComment() with ticketId, caller id, and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { comment: 'hi' } as never;

    void controller.addComment(1, USER, dto);
    expect(service.addComment).toHaveBeenCalledWith(1, 7, dto);
  });

  it('delegates updateComment() with commentId, caller id, and dto', () => {
    const service = makeService();
    const controller = new TicketController(service);
    const dto = { comment: 'edit' } as never;

    void controller.updateComment(1, USER, dto);
    expect(service.updateComment).toHaveBeenCalledWith(1, 7, dto);
  });

  it('delegates removeComment() with commentId and caller id', () => {
    const service = makeService();
    const controller = new TicketController(service);

    void controller.removeComment(1, USER);
    expect(service.removeComment).toHaveBeenCalledWith(1, 7);
  });
});
