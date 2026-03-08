import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Recuperar contrasena
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingresa tu email y te enviaremos un enlace para restablecer tu contrasena.
        </p>
        <div className="mt-8">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
