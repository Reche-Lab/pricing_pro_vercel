import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pricing Pro",
  description: "Plataforma multi-tenant de precificacao e orcamentos"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
