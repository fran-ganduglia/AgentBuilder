import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listAgents } from "@/lib/db/agents";
import { InviteForm } from "@/components/users/invite-form";
import type { UserProfile } from "@/types/app";

type UserRow = Pick<
  UserProfile,
  "id" | "email" | "full_name" | "role" | "is_active" | "created_at"
>;

const roleBadgeColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  editor: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-700",
  operador: "bg-green-100 text-green-700",
};

export default async function UsersSettingsPage() {
  const user = await requireUser();

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const supabase = await createServerSupabaseClient();

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_active, created_at")
    .eq("organization_id", user.organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const users = (usersData ?? []) as UserRow[];

  const { data: agents } = await listAgents(user.organizationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <p className="mt-1 text-sm text-gray-600">
          Gestiona los usuarios de tu organizacion
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Invitar usuario</h2>
        <p className="mt-1 text-sm text-gray-500">
          El usuario recibira un email con instrucciones para acceder
        </p>
        <div className="mt-4">
          <InviteForm agents={agents ?? []} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Miembros del equipo ({users.length})
          </h2>
        </div>

        {usersError && (
          <div className="px-6 py-4">
            <p className="text-sm text-red-600">
              No se pudieron cargar los usuarios
            </p>
          </div>
        )}

        {!usersError && users.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400">No hay usuarios registrados</p>
          </div>
        )}

        {!usersError && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Desde
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {member.full_name ?? "Sin nombre"}
                      </p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          roleBadgeColors[member.role] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {member.created_at
                        ? new Date(member.created_at).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
