import slugify from 'slugify';

export function baseSlug(name: string): string {
  return slugify(name, { lower: true, strict: true }) || 'org';
}
