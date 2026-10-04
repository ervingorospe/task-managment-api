import { Test } from '@nestjs/testing';
import { StorageModule } from './storage.module';
import { S3Service } from './s3.service';

describe('StorageModule', () => {
  it('wires S3Service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    expect(moduleRef.get(S3Service)).toBeInstanceOf(S3Service);
  });
});
