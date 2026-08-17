"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Copy, MailQuestion, X } from "lucide-react";
import type { AccessRequestRow } from "@/repositories/access-requests";
import type { BillingPlanRow } from "@/repositories/billing";

export function AccessRequestsPanel({ requests, plans }: { requests: AccessRequestRow[]; plans: BillingPlanRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const pending = useMemo(() => requests.filter((item) => ["pending_review", "needs_information", "pending_email"].includes(item.status)), [requests]);

  async function review(requestId: string, input: Record<string, unknown>) {
    setLoading(requestId);
    setMessage("");
    setInviteUrl("");
    const response = await fetch(`/api/superadmin/access-requests/${requestId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json().catch(() => null);
    setLoading("");
    if (!response.ok || !data?.ok) { setMessage(data?.error ?? "Não foi possível concluir a análise."); return; }
    setInviteUrl(data.inviteUrl ?? "");
    setMessage(data.status === "approved" ? (data.emailDelivery?.sent ? "Tenant criado e convite enviado." : "Tenant criado. Envie manualmente o convite abaixo.") : "Solicitação atualizada e comunicação enviada.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-sky-400/20 bg-zinc-900/70 p-5 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><ClipboardList className="text-sky-300" size={18} /><h2 className="font-semibold text-white">Solicitações de novos tenants</h2></div><p className="mt-1 text-sm text-zinc-500">Confirme os dados antes de liberar trial, owner e acesso à plataforma.</p></div>
        <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">{pending.length} em aberto</span>
      </div>
      {message ? <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">{message}{inviteUrl ? <button className="ml-3 inline-flex items-center gap-1 font-semibold text-amber-300" onClick={() => navigator.clipboard.writeText(inviteUrl)} type="button"><Copy size={13} /> Copiar convite</button> : null}</div> : null}
      <div className="mt-4 grid gap-3">
        {pending.map((request) => <AccessRequestCard disabled={loading === request.id} key={request.id} onReview={(input) => review(request.id, input)} plans={plans} request={request} />)}
        {!pending.length ? <p className="rounded-md border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">Nenhuma solicitação aguardando análise.</p> : null}
      </div>
      {requests.some((item) => !pending.includes(item)) ? <details className="mt-4 rounded-md border border-zinc-800"><summary className="cursor-pointer px-3 py-2 text-sm text-zinc-400">Histórico recente ({requests.length - pending.length})</summary><div className="grid gap-2 border-t border-zinc-800 p-3">{requests.filter((item) => !pending.includes(item)).slice(0, 30).map((item) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-950/50 px-3 py-2 text-sm" key={item.id}><span className="text-zinc-300">{item.company_name} · {item.full_name}</span><Status status={item.status} /></div>)}</div></details> : null}
    </section>
  );
}

function AccessRequestCard({ request, plans, disabled, onReview }: { request: AccessRequestRow; plans: BillingPlanRow[]; disabled: boolean; onReview: (input: Record<string, unknown>) => void }) {
  const [slug, setSlug] = useState(slugify(request.company_name));
  const [planId, setPlanId] = useState(plans.find((plan) => plan.active)?.id ?? "");
  const [trialDays, setTrialDays] = useState(14);
  const [aiLimit, setAiLimit] = useState(3);
  const [note, setNote] = useState("");
  return <article className="rounded-lg border border-zinc-800 bg-zinc-950/45"><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{request.company_name}</h3><Status status={request.status} /></div><p className="mt-1 text-sm text-zinc-300">{request.full_name} · {request.email}</p><p className="mt-1 text-xs text-zinc-500">{request.whatsapp}{request.business_segment ? ` · ${request.business_segment}` : ""}</p>{request.intended_use ? <p className="mt-3 max-w-3xl text-sm leading-5 text-zinc-400">{request.intended_use}</p> : null}{request.applicant_response ? <div className="mt-3 rounded-md border border-sky-400/20 bg-sky-400/10 p-3 text-sm text-sky-100"><span className="font-semibold">Resposta do solicitante:</span> {request.applicant_response}</div> : null}</div><span className="text-xs text-zinc-600">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(request.created_at))}</span></div>{request.status === "pending_email" ? <p className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-500">Aguardando a confirmação do e-mail. A aprovação permanece bloqueada.</p> : <details className="border-t border-zinc-800"><summary className="cursor-pointer px-4 py-3 text-sm font-medium text-sky-200">Analisar solicitação</summary><div className="grid gap-4 border-t border-zinc-800 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input label="Slug do tenant" onChange={setSlug} value={slug} /><label><span className="mb-1 block text-xs text-zinc-500">Plano inicial</span><select className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm" onChange={(e) => setPlanId(e.target.value)} value={planId}>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {(plan.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</option>)}</select></label><NumberInput label="Dias de trial" min={1} onChange={setTrialDays} value={trialDays} /><NumberInput label="Gerações IA por produto" min={0} onChange={setAiLimit} value={aiLimit} /></div><label><span className="mb-1 block text-xs text-zinc-500">Mensagem para pedir informações ou justificar recusa</span><textarea className="focus-ring min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm" maxLength={1000} onChange={(e) => setNote(e.target.value)} value={note} /></label><div className="flex flex-wrap gap-2"><button className="focus-ring inline-flex items-center gap-2 rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-50" disabled={disabled || !slug || !planId} onClick={() => onReview({ action: "approve", tenantSlug: slug, planId, trialDays, artworkAiGenerationLimit: aiLimit })} type="button"><Check size={15} /> Aprovar e convidar</button><button className="focus-ring inline-flex items-center gap-2 rounded-md border border-amber-400/30 px-3 py-2 text-sm text-amber-200 disabled:opacity-50" disabled={disabled || note.trim().length < 5} onClick={() => onReview({ action: "needs_information", message: note })} type="button"><MailQuestion size={15} /> Pedir informações</button><button className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-200 disabled:opacity-50" disabled={disabled || note.trim().length < 5} onClick={() => onReview({ action: "reject", message: note })} type="button"><X size={15} /> Rejeitar</button></div></div></details>}</article>;
}

function Status({ status }: { status: AccessRequestRow["status"] }) { const labels: Record<AccessRequestRow["status"], string> = { pending_email: "aguardando e-mail", pending_review: "em análise", needs_information: "aguardando informações", approved: "aprovada", rejected: "rejeitada", expired: "expirada", cancelled: "cancelada" }; return <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">{labels[status]}</span>; }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-1 block text-xs text-zinc-500">{label}</span><input className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm" onChange={(e) => onChange(e.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={value} /></label>; }
function NumberInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) { return <label><span className="mb-1 block text-xs text-zinc-500">{label}</span><input className="focus-ring h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm" min={min} onChange={(e) => onChange(Number(e.target.value))} type="number" value={value} /></label>; }
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
