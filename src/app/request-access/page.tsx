import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AccessRequestForm } from "@/components/auth/AccessRequestForm";

export default function RequestAccessPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-6 lg:sticky lg:top-12 lg:h-fit">
          <ShieldCheck className="text-amber-300" size={28} />
          <p className="mt-5 text-xs font-semibold uppercase text-amber-300">Novo tenant</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Experimente com os dados da sua empresa</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-300">Após confirmar seu e-mail, o pedido será analisado. Quando aprovado, você receberá um convite para definir a senha e iniciar o trial.</p>
          <ol className="mt-6 grid gap-3 text-sm text-zinc-400">
            <li>1. Confirme seu e-mail.</li><li>2. Aguarde a aprovação.</li><li>3. Defina a senha e aceite os termos.</li><li>4. Configure produtos, canais e integrações.</li>
          </ol>
        </aside>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5 sm:p-7">
          <Link className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white" href="/login"><ArrowLeft size={15} /> Voltar</Link>
          <h2 className="text-xl font-semibold text-white">Solicitar acesso</h2>
          <p className="mb-6 mt-1 text-sm text-zinc-500">Cada solicitação aprovada cria um ambiente isolado para a empresa.</p>
          <AccessRequestForm />
        </section>
      </div>
    </main>
  );
}
