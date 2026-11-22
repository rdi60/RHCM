import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for small at-rest secrets (TOTP seeds). The key
 * comes from MFA_ENCRYPTION_KEY (32 raw bytes, base64-encoded) — rotate it
 * by re-encrypting existing secrets, never by changing the format here.
 *
 * Deliberately NOT exported from @rhcm/shared: that package's barrel is
 * imported by the Next.js client bundle, and pulling node:crypto into a
 * browser bundle breaks the webpack build. The database package's seed
 * script keeps its own copy for the same reason (it runs standalone via
 * ts-node, outside this app's module resolution). If this needs to change,
 * change both copies together.
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
