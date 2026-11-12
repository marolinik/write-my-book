import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const VERSION_PREFIX = "v1";

/**
 * scrypt costs ~63 ms and 16 MiB per call, and the ghost-text route decrypts
 * on every pause (P2-20). The derived key depends only on the secret, so it
 * is computed once per secret per process.
 */
const derivedKeys = new Map<string, Buffer>();

function deriveKey(secret: string): Buffer {
  const cached = derivedKeys.get(secret);
  if (cached) return cached;
  const key = crypto.scryptSync(secret, "wmb-salt", 32);
  derivedKeys.set(secret, key);
  return key;
}

function currentSecret(): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("API_KEY_ENCRYPTION_SECRET is not configured");
  }
  return secret;
}

/**
 * Secrets to try on decrypt, newest first. Setting
 * API_KEY_ENCRYPTION_SECRET_PREVIOUS during a rotation keeps every row written
 * under the old secret readable until it is re-saved (P2-21).
 */
function decryptSecrets(): string[] {
  const previous = process.env.API_KEY_ENCRYPTION_SECRET_PREVIOUS;
  return previous ? [currentSecret(), previous] : [currentSecret()];
}

/** Encrypt an API key for storage in the database (AES-256-GCM). */
export function encryptApiKey(plaintext: string): string {
  const key = deriveKey(currentSecret());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Format: v1:iv:tag:ciphertext (all hex). Rows without the prefix are the
  // original iv:tag:ciphertext format and are still read.
  return `${VERSION_PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

function splitCiphertext(encrypted: string): [string, string, string] {
  const parts = encrypted.split(":");
  const body = parts[0] === VERSION_PREFIX ? parts.slice(1) : parts;
  const [ivHex, tagHex, ciphertext] = body;
  if (body.length !== 3 || !ivHex || !tagHex || !ciphertext) {
    throw new Error("Invalid encrypted key format");
  }
  return [ivHex, tagHex, ciphertext];
}

function decryptWith(secret: string, ivHex: string, tagHex: string, ciphertext: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** Decrypt an API key from the database. Throws when no configured secret opens it. */
export function decryptApiKey(encrypted: string): string {
  const [ivHex, tagHex, ciphertext] = splitCiphertext(encrypted);
  let lastError: unknown;
  for (const secret of decryptSecrets()) {
    try {
      return decryptWith(secret, ivHex, tagHex, ciphertext);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not decrypt key");
}

/** Decrypt, or log and return null. The ciphertext and the key never reach the log. */
export function tryDecryptApiKey(encrypted: string, context: string): string | null {
  try {
    return decryptApiKey(encrypted);
  } catch (error) {
    console.error(
      `[encryption] skipped an undecryptable key (${context}):`,
      error instanceof Error ? error.message : "unknown error"
    );
    return null;
  }
}

/** Mask an API key for display (show first 7 and last 4 chars). */
export function maskApiKey(key: string): string {
  if (key.length <= 11) return "****";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export interface StoredKeyMask {
  maskedKey: string | null;
  /** True when the row cannot be decrypted (rotated secret, corrupt row): the writer must enter it again. */
  needsReentry: boolean;
}

/** Mask a stored row for a list response without letting one bad row fail the whole list. */
export function maskStoredKey(encrypted: string): StoredKeyMask {
  const plain = tryDecryptApiKey(encrypted, "mask");
  return plain === null
    ? { maskedKey: null, needsReentry: true }
    : { maskedKey: maskApiKey(plain), needsReentry: false };
}
