"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Gauge,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
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
  { href: "/products", label: "Produtos", icon: Package },
  { href: "/platforms", label: "Canais", icon: Store },
  { href: "/packaging", label: "Embalagens", icon: Boxes },
  { href: "/shipping", label: "Frete", icon: Truck },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/quotes", label: "Orcamentos", icon: ClipboardList },
  { href: "/users", label: "Usuarios", icon: ShieldCheck },
  { href: "/audit", label: "Auditoria", icon: ScrollText }
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-6 text-sm">
      <div className="grid gap-1">
        {primaryItems.map((item) => (
          <NavItem active={isActive(pathname, item.href)} href={item.href} icon={item.icon} key={item.href}>
            {item.label}
          </NavItem>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Settings size={14} />
          Configuracoes
        </div>
        <div className="grid gap-1">
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
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        nested ? "ml-2" : "",
        active
          ? "bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/10"
          : "text-zinc-300 hover:bg-zinc-800/90 hover:text-white"
      ].join(" ")}
      href={href}
    >
      <span
        className={[
          "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full transition-opacity",
          active ? "bg-zinc-950 opacity-100" : "bg-amber-400 opacity-0 group-hover:opacity-70"
        ].join(" ")}
      />
      <Icon className={active ? "text-zinc-950" : "text-zinc-500 group-hover:text-amber-300"} size={17} />
      <span className="font-medium">{children}</span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/quotes") return pathname === "/quotes" || pathname.startsWith("/quotes/");
  return pathname === href;
}
