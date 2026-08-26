import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// AES-256-GCM encryption for secrets stored at rest (e.g. an inspector's SMTP
// password). The key is derived from a stable server-only secret so no plaintext
// password is ever persisted. Prefer a dedicated EMAIL_ENCRYPTION_KEY; otherwise
// derive from the service-role key (always set, never exposed to clients).
function encryptionKey(): Buffer {
  const raw =
    process.env.EMAIL_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "flow-insecure-fallback-key";
  return createHash("sha256").update(raw).digest(); // 32 bytes
}

// Returns "iv:tag:ciphertext", all base64.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

// Returns "" on any tampering / wrong key / bad format (never throws).
export function decryptSecret(enc: string): string {
  const parts = String(enc || "").split(":");
  if (parts.length !== 3) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[0], "base64"));
    decipher.setAuthTag(Buffer.from(parts[1], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
