import { LogOut } from "lucide-react";
import { BillingStatusBanner } from "@/components/billing/BillingStatusBanner";
import { SidebarNav } from "@/components/layout/SidebarNav";

type AppShellProps = {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
  title: string;
  subtitle?: string;
  tenantName?: string;
};

export function AppShell({ children, isSuperAdmin = false, title, subtitle, tenantName }: AppShellProps) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="mb-3 flex items-center justify-between gap-3 lg:mb-6 lg:block">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-amber-400">
              {tenantName ?? "Pricing Pro"}
            </p>
            <p className="mt-0.5 truncate text-base font-semibold text-white lg:mt-1 lg:text-lg">Pricing Pro</p>
          </div>

          <form action="/api/auth/logout" className="shrink-0 lg:hidden" method="post">
            <button
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Sair"
              type="submit"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>

        <SidebarNav isSuperAdmin={isSuperAdmin} />

        <form action="/api/auth/logout" className="mt-6 hidden lg:block" method="post">
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
        <header className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-4 lg:px-8 lg:py-5">
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold text-white sm:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
          <BillingStatusBanner />
          {children}
        </div>
      </section>
    </main>
  );
}
