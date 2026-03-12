import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/utils/env";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  provider: string;
  organizationId: string;
  userId: string;
  redirectPath: string;
  expiresAt: number;
};

type OAuthStateInput = Omit<OAuthStatePayload, "expiresAt">;

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function signPayload(payload: string): Buffer {
  return createHmac("sha256", env.INTEGRATION_SECRETS_ENCRYPTION_KEY)
    .update(payload)
    .digest();
}

function normalizeRedirectPath(value: string): string {
  return value.startsWith("/") ? value : "/settings/integrations";
}

export function createOAuthState(input: OAuthStateInput): string {
  const payload: OAuthStatePayload = {
    ...input,
    redirectPath: normalizeRedirectPath(input.redirectPath),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  };

  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const encodedSignature = toBase64Url(signPayload(encodedPayload));
  return `${encodedPayload}.${encodedSignature}`;
}

export function verifyOAuthState(
  value: string | null,
  expectedProvider: string
): OAuthStatePayload {
  if (!value) {
    throw new Error("Falta el state de OAuth");
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    throw new Error("El state de OAuth es invalido");
  }

  const [encodedPayload, encodedSignature] = parts;
  const expectedSignature = signPayload(encodedPayload);
  const receivedSignature = fromBase64Url(encodedSignature);

  if (expectedSignature.length !== receivedSignature.length) {
    throw new Error("La firma del state es invalida");
  }

  if (!timingSafeEqual(expectedSignature, receivedSignature)) {
    throw new Error("La firma del state no coincide");
  }

  let payload: OAuthStatePayload;

  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new Error("No se pudo leer el state de OAuth");
  }

  if (payload.provider !== expectedProvider) {
    throw new Error("El state corresponde a otro proveedor");
  }

  if (payload.expiresAt <= Date.now()) {
    throw new Error("El state de OAuth expiro");
  }

  return {
    ...payload,
    redirectPath: normalizeRedirectPath(payload.redirectPath),
  };
}