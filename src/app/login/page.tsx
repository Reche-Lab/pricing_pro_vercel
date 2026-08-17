import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentSession } from "@/lib/auth/session";
import Link from "next/link";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-800 px-4">
      <section className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Area segura</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Entrar no Pricing Pro</h1>
        <p className="mt-1 text-sm text-zinc-500">Acesso por usuario vinculado a um tenant.</p>
        <LoginForm />
        <div className="mt-5 border-t border-zinc-800 pt-5 text-center">
          <p className="text-sm text-zinc-500">Ainda não possui um ambiente?</p>
          <Link className="mt-2 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200" href="/request-access">
            Solicitar acesso para minha empresa
          </Link>
        </div>
      </section>
    </main>
  );
}
