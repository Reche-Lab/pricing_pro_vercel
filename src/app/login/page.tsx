import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Area segura</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Entrar no Pricing Pro</h1>
        <p className="mt-1 text-sm text-zinc-500">Acesso por usuario vinculado a um tenant.</p>
        <LoginForm />
      </section>
    </main>
  );
}
