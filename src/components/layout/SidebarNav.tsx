"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  Gauge,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users
} from "lucide-react";

const primaryItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/pricing", label: "Precificador", icon: BarChart3 }
];

const settingsItems = [
  { href: "/settings", label: "Geral", icon: Settings },
  { href: "/billing", label: "Assinatura", icon: CreditCard },
  { href: "/products", label: "Produtos", icon: Package },
  { href: "/platforms", label: "Canais", icon: Store },
  { href: "/packaging", label: "Embalagens", icon: Boxes },
  { href: "/shipping", label: "Frete", icon: Truck },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/quotes", label: "Orcamentos", icon: ClipboardList },
  { href: "/users", label: "Usuarios", icon: ShieldCheck },
  { href: "/audit", label: "Auditoria", icon: ScrollText }
];

export function SidebarNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 text-sm [-webkit-overflow-scrolling:touch] lg:grid lg:gap-6 lg:overflow-visible lg:pb-0">
      <div className="flex shrink-0 gap-2 lg:grid lg:gap-1">
        {primaryItems.map((item) => (
          <NavItem active={isActive(pathname, item.href)} href={item.href} icon={item.icon} key={item.href}>
            {item.label}
          </NavItem>
        ))}
        {isSuperAdmin ? (
          <NavItem active={isActive(pathname, "/superadmin")} href="/superadmin" icon={Sparkles}>
            Superadmin
          </NavItem>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 lg:block">
        <div className="hidden lg:mb-2 lg:flex lg:items-center lg:gap-2 lg:px-3 lg:text-xs lg:font-semibold lg:uppercase lg:tracking-wide lg:text-zinc-500">
          <Settings size={14} />
          Configuracoes
        </div>
        <div className="flex gap-2 lg:grid lg:gap-1">
          {settingsItems.map((item) => (
            <NavItem active={isActive(pathname, item.href)} href={item.href} icon={item.icon} key={item.href} nested>
              {item.label}
            </NavItem>
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  active,
  children,
  href,
  icon: Icon,
  nested = false
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  nested?: boolean;
}) {
  return (
    <Link
      className={[
        "group relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 transition-colors lg:gap-3",
        nested ? "lg:ml-2" : "",
        active
          ? "bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/10"
          : "text-zinc-300 hover:bg-zinc-800/90 hover:text-white"
      ].join(" ")}
      href={href}
    >
      <span
        className={[
          "absolute left-0 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-r-full transition-opacity lg:block",
          active ? "bg-zinc-950 opacity-100" : "bg-amber-400 opacity-0 group-hover:opacity-70"
        ].join(" ")}
      />
      <Icon className={active ? "text-zinc-950" : "text-zinc-500 group-hover:text-amber-300"} size={17} />
      <span className="whitespace-nowrap font-medium">{children}</span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/quotes") return pathname === "/quotes" || pathname.startsWith("/quotes/");
  return pathname === href;
}
