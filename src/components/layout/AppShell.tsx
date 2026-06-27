import Link from "next/link";
import { LogOut } from "lucide-react";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  tenantName?: string;
};

export function AppShell({ children, title, subtitle, tenantName }: AppShellProps) {
  return (
    <main className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              {tenantName ?? "Pricing Pro"}
            </p>
            <h1 className="text-2xl font-semibold text-zinc-950">{title}</h1>
            {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/dashboard">
              Dashboard
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/pricing">
              Precificador
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/products">
              Produtos
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/platforms">
              Canais
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/packaging">
              Embalagens
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/shipping">
              Frete
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/customers">
              Clientes
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/quotes">
              Orcamentos
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/users">
              Usuarios
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/settings">
              Configuracoes
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-zinc-700 hover:bg-zinc-100"
                type="submit"
              >
                <LogOut size={16} />
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
    </main>
  );
}
