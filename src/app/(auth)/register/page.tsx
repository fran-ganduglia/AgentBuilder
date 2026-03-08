import { getSession } from "@/lib/auth/get-session";
import { AuthSessionNotice } from "@/components/auth/auth-session-notice";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const session = await getSession();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Crear cuenta en AgentBuilder</h1>
          <p className="mt-2 text-sm text-gray-600">
            Configura tu organizacion y empieza a crear agentes de IA
          </p>
        </div>
        {session ? <AuthSessionNotice email={session.user.email} intent="register" /> : <RegisterForm />}
      </div>
    </main>
  );
}
