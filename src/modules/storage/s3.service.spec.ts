import { InternalServerErrorException, Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

function fakeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: 'photo.png',
    buffer: Buffer.from('fake'),
    mimetype: 'image/png',
    ...overrides,
  } as Express.Multer.File;
}

describe('S3Service', () => {
  const originalRegion = process.env.AWS_REGION;
  const originalBucket = process.env.AWS_S3_BUCKET;
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
  });

  afterEach(() => {
    process.env.AWS_REGION = originalRegion;
    process.env.AWS_S3_BUCKET = originalBucket;
    sendSpy.mockRestore();
  });

  it('uploads with a generated key under the given folder, preserving the extension', async () => {
    const service = new S3Service();
    const result = await service.upload(fakeFile(), 'avatars');

    expect(result.key).toMatch(/^avatars\/[0-9a-f-]+\.png$/);
    expect(result.url).toBe(
      `https://test-bucket.s3.us-east-1.amazonaws.com/${result.key}`,
    );
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults the folder to "attachments" when none is given', async () => {
    const service = new S3Service();
    const result = await service.upload(fakeFile());
    expect(result.key).toMatch(/^attachments\//);
  });

  it('deletes an object whose URL matches this bucket', async () => {
    const service = new S3Service();
    await service.delete(
      'https://test-bucket.s3.us-east-1.amazonaws.com/attachments/abc.png',
    );
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a URL that does not match this bucket (e.g. pre-migration local-disk URL)', async () => {
    const service = new S3Service();
    await service.delete('https://old-host.example.com/uploads/abc.png');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('swallows a delete failure and logs a warning instead of throwing', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    sendSpy.mockRejectedValueOnce(new Error('object already gone'));
    const service = new S3Service();

    await expect(
      service.delete(
        'https://test-bucket.s3.us-east-1.amazonaws.com/attachments/abc.png',
      ),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('swallows a delete failure that rejects with a non-Error value too', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    sendSpy.mockRejectedValueOnce('string rejection');
    const service = new S3Service();

    await expect(
      service.delete(
        'https://test-bucket.s3.us-east-1.amazonaws.com/attachments/abc.png',
      ),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('throws InternalServerErrorException when AWS_REGION/AWS_S3_BUCKET are not configured', async () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_S3_BUCKET;
    const service = new S3Service();

    await expect(service.upload(fakeFile())).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
