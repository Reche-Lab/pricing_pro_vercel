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
    <main className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              {tenantName ?? "Pricing Pro"}
            </p>
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
          </div>
          <nav className="flex items-center gap-2 overflow-x-auto pb-1 text-sm xl:pb-0">
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/dashboard">
              Dashboard
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/pricing">
              Precificador
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/products">
              Produtos
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/platforms">
              Canais
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/packaging">
              Embalagens
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/shipping">
              Frete
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/customers">
              Clientes
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/quotes">
              Orcamentos
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/users">
              Usuarios
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/audit">
              Auditoria
            </Link>
            <Link className="rounded-md px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white" href="/settings">
              Configuracoes
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
