import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { performProviderRequest, type ProviderRequestContext } from "@/lib/integrations/provider-gateway";
import { ProviderRequestError } from "@/lib/integrations/provider-errors";

const WHATSAPP_GRAPH_API_VERSION = "v23.0";
const WHATSAPP_REQUEST_TIMEOUT_MS = 15000;
const WHATSAPP_GRAPH_BASE_URL = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`;

type MetaGraphPhoneNumber = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  name_status?: string;
  platform_type?: string;
};

type MetaGraphResponse<T> = {
  data?: T[];
  error?: {
    message?: string;
  };
};

type WhatsAppProviderContext = Omit<ProviderRequestContext, "provider">;

export type WhatsAppCloudConfig = {
  accessToken: string;
  wabaId: string;
};

export type WhatsAppSource = {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
  platformType: string | null;
  wabaId: string;
};

function getSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

async function fetchMetaGraph<T>(
  path: string,
  accessToken: string,
  context?: WhatsAppProviderContext
): Promise<T> {
  const executeRequest = async (): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHATSAPP_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${WHATSAPP_GRAPH_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json()) as T & MetaGraphResponse<unknown>;

      if (!response.ok) {
        const providerMessage =
          payload && typeof payload === "object" && "error" in payload && payload.error
            ? payload.error.message
            : null;
        throw new ProviderRequestError({
          provider: "whatsapp",
          message: providerMessage || "Meta Cloud API rechazo la solicitud",
          statusCode: response.status,
          requestId: response.headers.get("x-fb-request-id"),
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderRequestError({
          provider: "whatsapp",
          message: "Meta Cloud API excedio el tiempo maximo de respuesta",
          statusCode: 504,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!context) {
    return executeRequest();
  }

  return performProviderRequest(
    {
      ...context,
      provider: "whatsapp",
      onBudgetExceededMessage: "Se alcanzo temporalmente el presupuesto operativo configurado para WhatsApp.",
    },
    executeRequest
  );
}

function toWhatsAppSource(
  phoneNumber: MetaGraphPhoneNumber,
  wabaId: string
): WhatsAppSource {
  return {
    phoneNumberId: phoneNumber.id,
    displayPhoneNumber: phoneNumber.display_phone_number ?? phoneNumber.id,
    verifiedName: phoneNumber.verified_name ?? null,
    qualityRating: phoneNumber.quality_rating ?? null,
    codeVerificationStatus: phoneNumber.code_verification_status ?? null,
    nameStatus: phoneNumber.name_status ?? null,
    platformType: phoneNumber.platform_type ?? null,
    wabaId,
  };
}

export async function listWhatsAppSources(
  config: WhatsAppCloudConfig,
  context?: WhatsAppProviderContext
): Promise<WhatsAppSource[]> {
  const payload = await fetchMetaGraph<MetaGraphResponse<MetaGraphPhoneNumber>>(
    `/${config.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type`,
    config.accessToken,
    context
  );

  return (payload.data ?? []).map((phoneNumber) => toWhatsAppSource(phoneNumber, config.wabaId));
}

export async function getWhatsAppSourceById(
  config: WhatsAppCloudConfig,
  phoneNumberId: string,
  context?: WhatsAppProviderContext
): Promise<WhatsAppSource | null> {
  const sources = await listWhatsAppSources(config, context);
  return sources.find((source) => source.phoneNumberId === phoneNumberId) ?? null;
}

export function buildWhatsAppAccessTokenHint(accessToken: string): string {
  return accessToken.length >= 4 ? `***${accessToken.slice(-4)}` : "***";
}

export function buildWhatsAppSourceMetadata(source: WhatsAppSource): Record<string, string | boolean> {
  const metadata: Record<string, string | boolean> = {
    display_phone_number: source.displayPhoneNumber,
    waba_id: source.wabaId,
    read_only: true,
  };

  if (source.verifiedName) {
    metadata.verified_name = source.verifiedName;
  }

  if (source.qualityRating) {
    metadata.quality_rating = source.qualityRating;
  }

  if (source.nameStatus) {
    metadata.name_status = source.nameStatus;
  }

  if (source.codeVerificationStatus) {
    metadata.code_verification_status = source.codeVerificationStatus;
  }

  if (source.platformType) {
    metadata.platform_type = source.platformType;
  }

  return metadata;
}

export function verifyWhatsAppSignature(
  payload: string,
  appSecret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  try {
    const expected = Buffer.from(
      createHmac("sha256", appSecret).update(payload).digest("hex"),
      "utf8"
    );
    const received = Buffer.from(signatureHeader.slice("sha256=".length), "utf8");

    if (expected.length !== received.length) {
      return false;
    }

    return timingSafeEqual(expected, received);
  } catch (error) {
    console.error("whatsapp.signature_verification_error", {
      error: getSafeErrorMessage(error),
    });
    return false;
  }
}

export function normalizeWhatsAppIdentifier(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
