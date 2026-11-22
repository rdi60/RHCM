import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for small at-rest secrets (TOTP seeds), matching
 * the format used by apps/api/src/common/crypto/secret-cipher.ts. Kept as
 * a separate copy rather than shared via @rhcm/shared, because that
 * package's barrel export is also imported by the Next.js client bundle,
 * where pulling in node:crypto breaks the webpack build. If this format
 * changes, change both copies together.
 */
export class SecretCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new Error("MFA_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
  }

  decrypt(encoded: string): string {
    const raw = Buffer.from(encoded, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
