import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentBuilder | Agentes de IA para empresas",
  description:
    "Crea y gestiona agentes de IA sin conocimientos tecnicos con una experiencia visual pensada para equipos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${manrope.className} bg-stone-50 text-slate-950 antialiased`}>
        {children}
      </body>
    </html>
  );
}
