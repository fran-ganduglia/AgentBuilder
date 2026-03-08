import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/get-session";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
} from "@/lib/db/notifications";
import { isValidSameOriginMutationRequest } from "@/lib/utils/request-security";

const patchSchema = z.object({
  action: z.enum(["mark_read", "mark_all_read"]),
  notificationId: z
    .string()
    .uuid("notificationId debe ser un UUID valido")
    .optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await listNotifications(session.organizationId);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron cargar las notificaciones" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request): Promise<NextResponse> {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido en el body del request" },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Input invalido";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { action, notificationId } = parsed.data;

  if (action === "mark_read") {
    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId es requerido para mark_read" },
        { status: 400 }
      );
    }

    const { data, error } = await markAsRead(notificationId, session.organizationId);

    if (error) {
      return NextResponse.json(
        { error: "No se pudo marcar la notificacion" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Notificacion no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  }

  if (action === "mark_all_read") {
    const { data, error } = await markAllAsRead(session.organizationId);

    if (error) {
      return NextResponse.json(
        { error: "No se pudieron marcar las notificaciones" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { marked: data } });
  }

  return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
}
