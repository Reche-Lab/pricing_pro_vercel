import Link from "next/link";
import { PricingCalculator } from "@/components/pricing/PricingCalculator";
import { demoVariants, platformPresets } from "@/domain/pricing/defaults";

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-zinc-800">
      <header className="border-b border-zinc-800 bg-zinc-900/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Demo publica</p>
            <h1 className="text-2xl font-semibold text-white">Pricing Pro</h1>
            <p className="text-sm text-zinc-500">Simulador com produtos ficticios e dados protegidos.</p>
          </div>
          <Link
            className="focus-ring rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            href="/login"
          >
            Entrar
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <PricingCalculator variants={demoVariants} platforms={platformPresets} readonlyMode />
      </div>
    </main>
  );
}
