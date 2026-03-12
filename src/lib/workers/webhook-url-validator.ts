import "server-only";

import { lookup } from "node:dns/promises";
import net from "node:net";

type ValidationSuccess = {
  valid: true;
  normalizedUrl: string;
};

type ValidationFailure = {
  valid: false;
  reason: string;
};

export type OutboundWebhookUrlValidationResult =
  | ValidationSuccess
  | ValidationFailure;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
  "100.100.100.200",
]);

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  if (normalized.includes(".")) {
    const ipv4Segment = normalized.slice(normalized.lastIndexOf(":") + 1);
    return isBlockedIpv4(ipv4Segment);
  }

  return false;
}

function isBlockedIpAddress(address: string): boolean {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    return isBlockedIpv4(address);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

export async function validateOutboundWebhookUrl(
  rawUrl: string
): Promise<OutboundWebhookUrlValidationResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "La URL del webhook no es valida" };
  }

  const isProduction = process.env.NODE_ENV === "production";
  const allowedProtocols = isProduction ? ["https:"] : ["https:", "http:"];

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return { valid: false, reason: "El webhook debe usar un protocolo permitido" };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { valid: false, reason: "La URL del webhook no puede incluir credenciales" };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: "El host del webhook no esta permitido" };
  }

  if (net.isIP(hostname) && isBlockedIpAddress(hostname)) {
    return { valid: false, reason: "La IP del webhook no esta permitida" };
  }

  let resolvedAddresses: Array<{ address: string }> = [];

  try {
    resolvedAddresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { valid: false, reason: "No se pudo resolver el host del webhook" };
  }

  if (resolvedAddresses.length === 0) {
    return { valid: false, reason: "El host del webhook no resolvio direcciones" };
  }

  const blockedAddress = resolvedAddresses.find((entry) => isBlockedIpAddress(entry.address));
  if (blockedAddress) {
    return { valid: false, reason: "El webhook resuelve a una IP interna o reservada" };
  }

  return { valid: true, normalizedUrl: parsedUrl.toString() };
}
