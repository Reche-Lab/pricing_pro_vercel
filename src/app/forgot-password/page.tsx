import { redirect } from "next/navigation";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getCurrentSession } from "@/lib/auth/session";

export default async function ForgotPasswordPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-800 px-4">
      <section className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Recuperar acesso</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enviaremos uma senha temporaria para o email cadastrado, se o usuario estiver ativo.
        </p>
        <ForgotPasswordForm />
        <Link className="mt-4 inline-flex text-sm font-medium text-amber-300 hover:text-amber-200" href="/login">
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}
