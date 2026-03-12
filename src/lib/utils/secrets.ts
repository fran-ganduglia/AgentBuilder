import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/utils/env";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const LEGACY_KEY_CONTEXT = "agentbuilder:integration-secrets:v1";
const PRIMARY_KEY_CONTEXT = "agentbuilder:integration-secrets:v2";
const PRIMARY_SECRET_VERSION = "v2";

function deriveKey(secret: string, context: string): Buffer {
  return createHash("sha256").update(secret).update(context).digest();
}

function getPrimarySecretKey(): Buffer {
  return deriveKey(env.INTEGRATION_SECRETS_ENCRYPTION_KEY, PRIMARY_KEY_CONTEXT);
}

function getLegacySecretKey(): Buffer {
  return deriveKey(env.SUPABASE_SERVICE_ROLE_KEY, LEGACY_KEY_CONTEXT);
}

function encodeEncryptedPayload(secretKey: Buffer, value: string, version?: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");

  return version ? `${version}:${payload}` : payload;
}

function decodeEncryptedPayload(secretKey: Buffer, payload: string): string {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, IV_LENGTH_BYTES);
  const authTag = buffer.subarray(
    IV_LENGTH_BYTES,
    IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
  );
  const encrypted = buffer.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, secretKey, iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function encryptSecret(value: string): string {
  return encodeEncryptedPayload(getPrimarySecretKey(), value, PRIMARY_SECRET_VERSION);
}

export function decryptSecret(payload: string): string {
  const separatorIndex = payload.indexOf(":");

  if (separatorIndex === -1) {
    return decodeEncryptedPayload(getLegacySecretKey(), payload);
  }

  const version = payload.slice(0, separatorIndex);
  const encodedPayload = payload.slice(separatorIndex + 1);

  if (version === PRIMARY_SECRET_VERSION) {
    return decodeEncryptedPayload(getPrimarySecretKey(), encodedPayload);
  }

  throw new Error("Version de cifrado no soportada para integration_secrets");
}
