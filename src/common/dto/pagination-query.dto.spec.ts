import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('coerces page/limit query strings to numbers', () => {
    const instance = plainToInstance(PaginationQueryDto, {
      page: '2',
      limit: '50',
    });
    expect(instance.page).toBe(2);
    expect(instance.limit).toBe(50);
  });

  it('defaults page/limit when omitted', () => {
    const instance = plainToInstance(PaginationQueryDto, {});
    expect(instance.page).toBe(1);
    expect(instance.limit).toBe(15);
  });
});
