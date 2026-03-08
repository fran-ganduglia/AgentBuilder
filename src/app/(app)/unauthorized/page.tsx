import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold text-gray-900">Acceso denegado</h1>
      <p className="mt-4 text-lg text-gray-600">
        No tienes permisos para acceder a esta pagina.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Ir al dashboard
      </Link>
    </div>
  );
}
