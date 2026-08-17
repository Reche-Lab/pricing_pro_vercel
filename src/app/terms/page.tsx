import { redirect } from "next/navigation";
import { LegalTermsGate } from "@/components/auth/LegalTermsGate";
import { renderLegalTermHtml } from "@/domain/legal/terms";
import { getCurrentSession } from "@/lib/auth/session";
import { getAcceptedActiveLegalTermVersion, getActiveLegalTerm } from "@/repositories/legal-terms";

export default async function TermsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.requiresTerms) redirect("/dashboard");
  const [term, acceptedVersion] = await Promise.all([getActiveLegalTerm(), getAcceptedActiveLegalTermVersion(session.userId, session.tenantId)]);
  if (!term) return <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100"><div className="max-w-md rounded-lg border border-red-400/30 bg-red-400/10 p-5"><h1 className="font-semibold">Termo indisponível</h1><p className="mt-2 text-sm text-zinc-300">O administrador precisa publicar o termo vigente antes de liberar o acesso.</p></div></main>;
  if (acceptedVersion === term.version && session.acceptedTermsVersion === term.version) redirect("/dashboard");
  return <main className="min-h-screen bg-zinc-950 px-3 py-5 text-zinc-100 sm:px-6 sm:py-10"><LegalTermsGate term={{ id: term.id, title: term.title, version: term.version, contentHtml: renderLegalTermHtml(term.content_text) }} /></main>;
}
