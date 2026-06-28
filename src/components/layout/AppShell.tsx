import { LogOut } from "lucide-react";
import { SidebarNav } from "@/components/layout/SidebarNav";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  tenantName?: string;
};

export function AppShell({ children, title, subtitle, tenantName }: AppShellProps) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-zinc-800 bg-zinc-950 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
            {tenantName ?? "Pricing Pro"}
          </p>
          <p className="mt-1 text-lg font-semibold text-white">Pricing Pro</p>
        </div>

        <SidebarNav />

        <form action="/api/auth/logout" className="mt-6" method="post">
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            type="submit"
          >
            <LogOut size={16} />
            Sair
          </button>
        </form>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-5 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
      </section>
    </main>
  );
}
