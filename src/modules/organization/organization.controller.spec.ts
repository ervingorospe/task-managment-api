import { ForbiddenException } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import type { OrganizationService } from './organization.service';
import type { RequestUser } from '../../common/guards/permissions.guard';

const USER: RequestUser = {
  id: 7,
  email: 'jane@example.com',
  isVerified: true,
  createdViaInvite: false,
};

function makeService() {
  return {
    create: jest.fn(),
    myOwnOrganizations: jest.fn(),
    defaultRoles: jest.fn(),
    defaultTags: jest.fn(),
    defaultPermissions: jest.fn(),
    getDetailsById: jest.fn(),
    getDetailsBySlug: jest.fn(),
    updateBasicInfo: jest.fn(),
    uploadLogo: jest.fn(),
    updateTimezone: jest.fn(),
    updateInviteExpiration: jest.fn(),
    updateNotifications: jest.fn(),
    updateActiveState: jest.fn(),
    remove: jest.fn(),
    requestOwnershipTransfer: jest.fn(),
    cancelOwnershipTransfer: jest.fn(),
  } as unknown as OrganizationService;
}

describe('OrganizationController', () => {
  describe('createOrganization', () => {
    it('throws ForbiddenException for an invite-created account', () => {
      const service = makeService();
      const controller = new OrganizationController(service);

      expect(() =>
        controller.createOrganization({} as never, {
          ...USER,
          createdViaInvite: true,
        }),
      ).toThrow(ForbiddenException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('delegates with the dto and the caller id as ownerId', () => {
      const service = makeService();
      const controller = new OrganizationController(service);
      const dto = { organizationName: 'Acme' } as never;

      void controller.createOrganization(dto, USER);
      expect(service.create).toHaveBeenCalledWith(dto, 7);
    });
  });

  it('delegates myOwnOrganizations() with the caller id', () => {
    const service = makeService();
    const controller = new OrganizationController(service);

    void controller.myOwnOrganizations(USER);
    expect(service.myOwnOrganizations).toHaveBeenCalledWith(7);
  });

  it('delegates defaultRoles()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    void controller.defaultRoles();
    expect(service.defaultRoles).toHaveBeenCalled();
  });

  it('delegates defaultTags()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    void controller.defaultTags();
    expect(service.defaultTags).toHaveBeenCalled();
  });

  it('delegates defaultPermissions()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    void controller.defaultPermissions();
    expect(service.defaultPermissions).toHaveBeenCalled();
  });

  it('delegates organizationDetailsById() with orgId', () => {
    const service = makeService();
    const controller = new OrganizationController(service);

    void controller.organizationDetailsById(5);
    expect(service.getDetailsById).toHaveBeenCalledWith(5);
  });

  it('delegates organizationDetails() with slug', () => {
    const service = makeService();
    const controller = new OrganizationController(service);

    void controller.organizationDetails('acme');
    expect(service.getDetailsBySlug).toHaveBeenCalledWith('acme');
  });

  it('delegates updateBasicInfo() with orgId and the dto', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { organizationName: 'New' } as never;

    void controller.updateBasicInfo(5, dto);
    expect(service.updateBasicInfo).toHaveBeenCalledWith(5, dto);
  });

  it('delegates uploadLogo() with orgId and the file', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const file = {} as Express.Multer.File;

    void controller.uploadLogo(5, file);
    expect(service.uploadLogo).toHaveBeenCalledWith(5, file);
  });

  it('delegates updateTimezone()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { timezone: 'UTC' } as never;

    void controller.updateTimezone(5, dto);
    expect(service.updateTimezone).toHaveBeenCalledWith(5, dto);
  });

  it('delegates updateInviteExpiration()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { inviteExpiration: '1_day' } as never;

    void controller.updateInviteExpiration(5, dto);
    expect(service.updateInviteExpiration).toHaveBeenCalledWith(5, dto);
  });

  it('delegates updateNotifications()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { sendEmailNotif: false } as never;

    void controller.updateNotifications(5, dto);
    expect(service.updateNotifications).toHaveBeenCalledWith(5, dto);
  });

  it('delegates updateActiveState()', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { isActive: false } as never;

    void controller.updateActiveState(5, dto);
    expect(service.updateActiveState).toHaveBeenCalledWith(5, dto);
  });

  it('delegates remove() with orgId', () => {
    const service = makeService();
    const controller = new OrganizationController(service);

    void controller.remove(5);
    expect(service.remove).toHaveBeenCalledWith(5);
  });

  it('delegates requestOwnershipTransfer() with orgId, the dto, and the caller id', () => {
    const service = makeService();
    const controller = new OrganizationController(service);
    const dto = { email: 'x@y.com' } as never;

    void controller.requestOwnershipTransfer(5, dto, USER);
    expect(service.requestOwnershipTransfer).toHaveBeenCalledWith(5, dto, 7);
  });

  it('delegates cancelOwnershipTransfer() with orgId', () => {
    const service = makeService();
    const controller = new OrganizationController(service);

    void controller.cancelOwnershipTransfer(5);
    expect(service.cancelOwnershipTransfer).toHaveBeenCalledWith(5);
  });
});
