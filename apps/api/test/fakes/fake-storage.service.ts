import { Injectable } from "@nestjs/common";

/**
 * Test double for StorageService — e2e tests exercise our own API/DB
 * behavior (document rows, permissions, audit logs), not a third-party
 * object store, so this never touches the network. Swapped in by
 * createTestApp() via Nest's overrideProvider.
 */
@Injectable()
export class FakeStorageService {
  async onModuleInit() {}

  async getUploadUrl(key: string): Promise<string> {
    return `https://fake-storage.test/upload/${encodeURIComponent(key)}`;
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `https://fake-storage.test/download/${encodeURIComponent(key)}`;
  }

  async deleteObject(_key: string): Promise<void> {}
}
