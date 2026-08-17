import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3 } from "lucide-react";
import { hashAccessRequestToken } from "@/domain/access-requests/tokens";
import { getAccessRequestByPublicToken } from "@/repositories/access-requests";
import { AccessRequestAdditionalInfo } from "@/components/auth/AccessRequestAdditionalInfo";

const LABELS = { pending_email: "Aguardando confirmação do e-mail", pending_review: "Em análise", needs_information: "Mais informações necessárias", approved: "Aprovada", rejected: "Não aprovada", expired: "Expirada", cancelled: "Cancelada" } as const;

export default async function AccessRequestStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await getAccessRequestByPublicToken(hashAccessRequestToken(token));
  if (!request) notFound();
  const detail = request.status === "rejected" ? request.rejection_reason : request.status === "needs_information" ? request.review_notes : null;
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-8"><section className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900/80 p-6"><Clock3 className="text-amber-300" size={30} /><p className="mt-4 text-xs font-semibold uppercase text-zinc-500">{request.company_name}</p><h1 className="mt-1 text-2xl font-semibold text-white">{LABELS[request.status]}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{statusDescription(request.status)}</p>{detail ? <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">{detail}</div> : null}{request.status === "needs_information" ? <AccessRequestAdditionalInfo token={token} /> : null}<p className="mt-5 text-xs text-zinc-600">Solicitação criada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(request.created_at))}.</p><Link className="mt-5 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200" href="/">Voltar ao Pricing Pro</Link></section></main>;
}

function statusDescription(status: keyof typeof LABELS) {
  if (status === "pending_email") return "Abra o e-mail enviado pelo Pricing Pro e confirme o endereço para continuar.";
  if (status === "pending_review") return "Seus dados foram confirmados e estão sendo analisados pelo administrador da plataforma.";
  if (status === "needs_information") return "O administrador precisa de informações adicionais antes de concluir a análise.";
  if (status === "approved") return "Seu ambiente foi aprovado. Verifique o e-mail para ativar o acesso e definir sua senha.";
  if (status === "rejected") return "A solicitação foi encerrada. Consulte a justificativa abaixo ou fale com o suporte.";
  return "Esta solicitação não está mais ativa.";
}
