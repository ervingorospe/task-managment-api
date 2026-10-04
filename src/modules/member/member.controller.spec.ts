import { MemberController } from './member.controller';
import type { MemberService } from './member.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    members: jest.fn(),
    invites: jest.fn(),
    invite: jest.fn(),
    resend: jest.fn(),
    removeInvite: jest.fn(),
    updateRole: jest.fn(),
    updateActiveState: jest.fn(),
    remove: jest.fn(),
  } as unknown as MemberService;
}

describe('MemberController', () => {
  it('delegates members() with the query', () => {
    const service = makeService();
    const controller = new MemberController(service);
    const query = { orgId: 5 } as never;

    void controller.members(query);
    expect(service.members).toHaveBeenCalledWith(query);
  });

  it('delegates invites() with orgId', () => {
    const service = makeService();
    const controller = new MemberController(service);

    void controller.invites(5);
    expect(service.invites).toHaveBeenCalledWith(5);
  });

  it('delegates invite() with orgId, the dto, and the caller id', () => {
    const service = makeService();
    const controller = new MemberController(service);
    const dto = { email: 'x@y.com', roleId: 2 } as never;

    void controller.invite(5, dto, USER);
    expect(service.invite).toHaveBeenCalledWith(5, dto, 7);
  });

  it('delegates resend() with inviteId and the caller id', () => {
    const service = makeService();
    const controller = new MemberController(service);

    void controller.resend(1, USER);
    expect(service.resend).toHaveBeenCalledWith(1, 7);
  });

  it('delegates removeInvite() with inviteId', () => {
    const service = makeService();
    const controller = new MemberController(service);

    void controller.removeInvite(1);
    expect(service.removeInvite).toHaveBeenCalledWith(1);
  });

  it('delegates updateRole() with memberId and the dto', () => {
    const service = makeService();
    const controller = new MemberController(service);
    const dto = { roleId: 2 } as never;

    void controller.updateRole(1, dto);
    expect(service.updateRole).toHaveBeenCalledWith(1, dto);
  });

  it('delegates updateActiveState() with memberId and the dto', () => {
    const service = makeService();
    const controller = new MemberController(service);
    const dto = { isActive: false } as never;

    void controller.updateActiveState(1, dto);
    expect(service.updateActiveState).toHaveBeenCalledWith(1, dto);
  });

  it('delegates remove() with memberId', () => {
    const service = makeService();
    const controller = new MemberController(service);

    void controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
