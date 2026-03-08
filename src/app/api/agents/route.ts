import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import { createAgent } from "@/lib/db/agents";
import type { Role } from "@/types/app";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const ALLOWED_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-6",
  "gemini-pro",
] as const;

const ROLES_WITH_WRITE_ACCESS: readonly Role[] = ["admin", "editor"];

const createAgentSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "El nombre no puede superar 100 caracteres"),
  systemPrompt: z.string().min(1, "El system prompt es requerido"),
  llmModel: z.enum(ALLOWED_MODELS, { message: "Modelo no permitido" }),
  llmTemperature: z.number().min(0, "La temperatura minima es 0.0").max(1, "La temperatura maxima es 1.0"),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!isValidSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type debe ser application/json" },
      { status: 400 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!ROLES_WITH_WRITE_ACCESS.includes(session.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido en el body del request" },
      { status: 400 }
    );
  }

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Input invalido";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { data: agent, error } = await createAgent(
    parsed.data,
    session.organizationId,
    session.user.id
  );

  if (error || !agent) {
    return NextResponse.json(
      { error: error ?? "No se pudo crear el agente" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: agent }, { status: 201 });
}
