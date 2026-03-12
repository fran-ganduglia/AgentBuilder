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
  admin: "bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-600/20",
  editor: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  viewer: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/10",
  operador: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
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
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Usuarios
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Gestiona los miembros de tu organización y sus privilegios operativos.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
             <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
                <h2 className="text-base font-bold text-slate-900">Invitar usuario</h2>
                <p className="mt-1 text-sm text-slate-500">
                  El usuario recibirá un email con instrucciones.
                </p>
             </div>
             <div className="p-6">
               <InviteForm agents={agents ?? []} />
             </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-5">
              <h2 className="text-base font-bold text-slate-900">
                Directorio de Miembros
              </h2>
              <span className="inline-flex items-center justify-center rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                {users.length} {users.length === 1 ? 'Usuario' : 'Usuarios'}
              </span>
            </div>

            {usersError && (
              <div className="p-6">
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-medium text-rose-800">
                    No se pudo cargar el listado de usuarios de la organización.
                  </p>
                </div>
              </div>
            )}

            {!usersError && users.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-400">El directorio está temporalmente vacío.</p>
              </div>
            )}

            {!usersError && users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-white">
                    <tr>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        Usuario
                      </th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        Rol
                      </th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        Estado
                      </th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        Incorporación
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((member) => (
                      <tr key={member.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-900">
                            {member.full_name ?? "Sin nombre designado"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{member.email}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                              roleBadgeColors[member.role] ?? "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/10"
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {member.is_active ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                              Inactivo u Ocultado
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-slate-500">
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
        </section>
      </div>
    </div>
  );
}
