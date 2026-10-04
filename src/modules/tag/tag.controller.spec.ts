import { TagController } from './tag.controller';
import type { TagService } from './tag.service';

function makeService() {
  return {
    tags: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as TagService;
}

describe('TagController', () => {
  it('delegates tags() to the service with orgId', () => {
    const service = makeService();
    const controller = new TagController(service);

    void controller.tags(5);
    expect(service.tags).toHaveBeenCalledWith(5);
  });

  it('delegates add() to the service with orgId and the dto', () => {
    const service = makeService();
    const controller = new TagController(service);
    const dto = { tagName: 'Bug', color: '#f00' } as never;

    void controller.add(5, dto);
    expect(service.add).toHaveBeenCalledWith(5, dto);
  });

  it('delegates update() to the service with tagId and the dto', () => {
    const service = makeService();
    const controller = new TagController(service);
    const dto = { tagName: 'Bug' } as never;

    void controller.update(1, dto);
    expect(service.update).toHaveBeenCalledWith(1, dto);
  });

  it('delegates remove() to the service with tagId', () => {
    const service = makeService();
    const controller = new TagController(service);

    void controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
