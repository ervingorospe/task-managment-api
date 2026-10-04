import { plainToInstance } from 'class-transformer';
import { CreateOrganizationDto } from './create-organization.dto';

describe('CreateOrganizationDto', () => {
  it('transforms nested roles/invites/tags into their own class instances', () => {
    const instance = plainToInstance(CreateOrganizationDto, {
      organizationName: 'Acme',
      timezone: 'UTC',
      roles: [{ isDefault: true, roleName: 'Superadmin', rules: [{ id: 1 }] }],
      invites: [{ email: 'bob@x.com', roleId: 1 }],
      tags: [{ tagName: 'Bug', color: '#f00', isDefault: true }],
    });

    expect(instance.roles[0]).toBeInstanceOf(Object);
    expect(instance.roles[0].rules[0].id).toBe(1);
    expect(instance.invites[0].email).toBe('bob@x.com');
    expect(instance.tags[0].tagName).toBe('Bug');
  });

  it('normalizes an empty-string email to undefined', () => {
    const instance = plainToInstance(CreateOrganizationDto, {
      organizationName: 'Acme',
      timezone: 'UTC',
      email: '',
      roles: [],
      invites: [],
      tags: [],
    });
    expect(instance.email).toBeUndefined();
  });
});
