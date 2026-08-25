"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowDownRight, ArrowRightLeft, ArrowUpRight, Building2, Check,
  ChevronLeft, ChevronRight, CircleDollarSign, Download, FileSpreadsheet, Landmark, Loader2,
  Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Tags, Trash2, Upload, WalletCards, X
} from "lucide-react";
import { isValidCompetence, shiftCompetence } from "@/domain/finance/competence";

type Account = {
  id: string; name: string; institution: string; account_type: string; currency: string;
  ownership_type: string; same_economic_entity: boolean; required_for_monthly_close: boolean; active: boolean;
};
type Transaction = {
  id: string; transaction_date: string; original_description: string; counterparty: string | null;
  amount_cents: string; direction: "inflow" | "outflow" | "neutral"; nature: string;
  category_id: string | null; category_name: string | null; account_name: string; source_type: string;
  review_required: boolean; review_status: string; transfer_status: string | null;
};
type Overview = {
  competence: string; month: { status: string; closing_notes: string | null };
  metrics: Record<string, number>; accounts: Account[];
  imports: Array<Record<string, string | number | null>>; transactions: Transaction[];
  categories: Array<{ id: string; name: string; type: string; affects_operating_result: boolean }>;
  natures: ManagedNature[];
  transfers: Array<Record<string, string | number | null>>;
};
type Tab = "dashboard" | "imports" | "transactions" | "transfers" | "olist" | "accounts" | "categories" | "natures";
type ManagedCategory = {
  id: string; parent_id: string | null; name: string; type: "income" | "expense" | "neutral";
  affects_operating_result: boolean; active: boolean; olist_category_id: string | null;
  transaction_count: string; active_children_count: string;
};
type ManagedNature = {
  id: string; key: string; name: string; type: "income" | "expense" | "neutral";
  default_include_external_cash_flow: boolean; default_include_operating_result: boolean;
  protected: boolean; active: boolean; transaction_count: string;
};
type Preview = {
  file: File; status: "loading" | "ready" | "importing" | "done" | "error" | "mapping";
  accountId: string;
  data?: { institution: string; adapterName: string; rows: number; transactions: number; inflowsCents: number;
    outflowsCents: number; initialBalanceCents: number | null; finalBalanceCents: number | null;
    informativeRows: number; mismatchedPeriodRows: number; warnings: string[] };
  error?: string; headers?: string[]; mapping?: Record<string, string>;
};

const FALLBACK_NATURES = [
  ["operating_revenue", "Receita operacional"], ["operating_expense", "Despesa operacional"],
  ["refund", "Estorno e devolução"], ["debt", "Dívidas e financiamentos"],
  ["internal_transfer", "Transferência interna"], ["owner_contribution", "Aporte do titular ou sócio"],
  ["owner_withdrawal", "Retirada do titular ou sócio"], ["owner_loan", "Empréstimo do titular"],
  ["reimbursement", "Reembolso"], ["personal", "Movimentação pessoal"],
  ["unclassified", "Não classificado"], ["informative", "Informativo"]
] as const;

export function FinanceWorkspace({ initialOverview }: { initialOverview: Overview }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<Tab>(initialOverview.transactions.length ? "dashboard" : "imports");
  const [busy, setBusy] = useState(false);
  const [competenceDraft, setCompetenceDraft] = useState(initialOverview.competence);
  const competenceRequest = useRef(0);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  async function refresh() {
    const response = await fetch(`/api/finance/overview?competence=${overview.competence}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o financeiro.");
    setOverview(payload.overview);
    router.replace(`/finance?competence=${overview.competence}`, { scroll: false });
  }

  async function changeCompetence(competence: string) {
    if (!isValidCompetence(competence)) return;
    if (competence === overview.competence) {
      setCompetenceDraft(competence);
      return;
    }
    const requestId = ++competenceRequest.current;
    setBusy(true);
    try {
      const response = await fetch(`/api/finance/overview?competence=${competence}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (requestId !== competenceRequest.current) return;
      setOverview(payload.overview);
      setCompetenceDraft(payload.overview.competence);
      router.replace(`/finance?competence=${competence}`, { scroll: false });
    } catch (error) {
      if (requestId !== competenceRequest.current) return;
      setCompetenceDraft(overview.competence);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao alterar competência." });
    } finally {
      if (requestId === competenceRequest.current) setBusy(false);
    }
  }

  function moveCompetence(offset: number) {
    const next = shiftCompetence(overview.competence, offset);
    setCompetenceDraft(next);
    void changeCompetence(next);
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><WalletCards size={20} /></div>
          <div>
            <p className="text-xs uppercase text-zinc-500">Competência</p>
            <div className="mt-1 flex items-center gap-1">
              <button aria-label="Mês anterior" className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40" disabled={busy} onClick={() => moveCompetence(-1)} title="Mês anterior" type="button"><ChevronLeft size={16}/></button>
              <input aria-label="Competência" className="h-9 min-w-0 rounded-md border border-zinc-700 px-2 text-sm" onBlur={() => { if (!isValidCompetence(competenceDraft)) setCompetenceDraft(overview.competence); }} onChange={(event) => { const next = event.target.value; setCompetenceDraft(next); if (isValidCompetence(next)) void changeCompetence(next); }} type="month" value={competenceDraft}/>
              <button aria-label="Próximo mês" className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40" disabled={busy} onClick={() => moveCompetence(1)} title="Próximo mês" type="button"><ChevronRight size={16}/></button>
            </div>
          </div>
          {busy ? <Loader2 className="animate-spin text-zinc-500" size={18} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={overview.month.status} />
          <button className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400" onClick={() => setTab("imports")} type="button"><Upload size={15} /> Importar extratos CSV</button>
          <a className="focus-ring inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800" href={`/api/finance/export?competence=${overview.competence}&format=csv`}><Download size={15} /> CSV</a>
          <a className="focus-ring inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400" href={`/api/finance/export?competence=${overview.competence}&format=xlsx`}><FileSpreadsheet size={15} /> Excel</a>
        </div>
      </div>

      {message ? <Notice {...message} onClose={() => setMessage(null)} /> : null}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-1" aria-label="Financeiro">
        {([
          ["dashboard", "Visão geral"], ["imports", "Importações"], ["transactions", `Lançamentos (${overview.transactions.length})`],
          ["transfers", `Transferências (${overview.transfers.length})`], ["categories", "Categorias"], ["natures", "Naturezas"], ["accounts", `Contas (${overview.accounts.length})`]
          , ["olist", "Conciliação Olist"]
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button className={`focus-ring shrink-0 rounded-md px-3 py-2 text-sm font-medium ${tab === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`} key={id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "dashboard" ? <Dashboard overview={overview} onRefresh={refresh} onMessage={setMessage} /> : null}
      {tab === "imports" ? <ImportWorkspace overview={overview} onRefresh={refresh} onMessage={setMessage} /> : null}
      {tab === "transactions" ? <Transactions overview={overview} onRefresh={refresh} onMessage={setMessage} /> : null}
      {tab === "transfers" ? <Transfers overview={overview} onRefresh={refresh} onMessage={setMessage} /> : null}
      {tab === "olist" ? <OlistReconciliation overview={overview} onMessage={setMessage} /> : null}
      {tab === "categories" ? <Categories onMessage={setMessage} onRefresh={refresh} /> : null}
      {tab === "natures" ? <Natures onMessage={setMessage} onRefresh={refresh} /> : null}
      {tab === "accounts" ? <Accounts accounts={overview.accounts} onRefresh={refresh} onMessage={setMessage} /> : null}
    </div>
  );
}

function Dashboard({ overview, onRefresh, onMessage }: PanelProps) {
  const metrics = overview.metrics;
  const accountTotals = useMemo(() => overview.transactions.reduce<Record<string, { incoming: number; outgoing: number }>>((totals, item) => {
    const current = totals[item.account_name] ?? { incoming: 0, outgoing: 0 };
    const amount = Number(item.amount_cents);
    if (amount > 0) current.incoming += amount; else current.outgoing += Math.abs(amount);
    totals[item.account_name] = current; return totals;
  }, {}), [overview.transactions]);
  const maxAccount = Math.max(1, ...Object.values(accountTotals).flatMap((item) => [item.incoming, item.outgoing]));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Entradas externas" value={metrics.externalInflowsCents} icon={ArrowUpRight} tone="emerald" />
        <Metric label="Saídas externas" value={metrics.externalOutflowsCents} icon={ArrowDownRight} tone="rose" />
        <Metric label="Fluxo líquido externo" value={metrics.externalNetCashFlowCents} icon={CircleDollarSign} tone="amber" signed />
        <Metric label="Resultado operacional" value={metrics.operatingResultCents} icon={Landmark} tone="cyan" signed />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-5"><h2 className="font-semibold text-white">Movimentação por conta</h2><p className="text-xs text-zinc-500">Entradas e saídas brutas da competência. Clique em Lançamentos para revisar os detalhes.</p></div>
          <div className="space-y-5">{Object.entries(accountTotals).map(([name, total]) => <div key={name}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{name}</span><span className="shrink-0 text-xs text-zinc-500">{money(total.incoming)} / {money(total.outgoing)}</span></div>
            <div className="grid gap-1"><Bar width={total.incoming / maxAccount * 100} tone="emerald" /><Bar width={total.outgoing / maxAccount * 100} tone="rose" /></div>
          </div>)}</div>
          {!Object.keys(accountTotals).length ? <Empty text="Importe extratos para visualizar a movimentação por conta." /> : null}
        </section>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="font-semibold text-white">Revisão do mês</h2>
          <div className="mt-4 grid gap-2">
            <ReviewLine label="Lançamentos a revisar" value={metrics.reviewCount} danger={metrics.reviewCount > 0} />
            <ReviewLine label="Sem classificação" value={metrics.unclassifiedCount} danger={metrics.unclassifiedCount > 0} />
            <ReviewLine label="Transferências excluídas" value={money(metrics.internalTransfersExcludedCents)} />
            <ReviewLine label="Pagamentos de dívidas" value={money(metrics.debtPaymentsCents)} />
            <ReviewLine label="Impacto de estornos" value={money(metrics.refundsNetCents)} />
          </div>
          <MonthAction overview={overview} onRefresh={onRefresh} onMessage={onMessage} />
        </section>
      </div>
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80">
        Este é um resultado gerencial. Fluxo líquido não é necessariamente lucro; pagamentos de dívidas reduzem o caixa sem serem automaticamente despesas operacionais; transferências internas confirmadas não alteram o consolidado. Não substitui a contabilidade.
      </div>
    </div>
  );
}

function ImportWorkspace({ overview, onRefresh, onMessage }: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(overview.accounts[0]?.id ?? "");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (!overview.accounts.some((account) => account.id === accountId)) {
      setAccountId(overview.accounts[0]?.id ?? "");
    }
  }, [accountId, overview.accounts]);

  async function addFiles(files: File[]) {
    const accepted = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (!accountId) {
      onMessage({ tone: "info", text: "Cadastre a conta financeira que receberá os lançamentos antes de selecionar o extrato." });
      setCreatingAccount(true);
      return;
    }
    if (!accepted.length) {
      onMessage({ tone: "error", text: "Nenhum arquivo CSV válido foi selecionado." });
      return;
    }
    if (accepted.length !== files.length) {
      onMessage({ tone: "info", text: "Arquivos que não eram CSV foram ignorados." });
    }
    const startIndex = previews.length;
    setPreviews((current) => [...current, ...accepted.map((file) => ({ file, accountId, status: "loading" as const }))]);
    await Promise.all(accepted.map(async (file, index) => {
      const position = startIndex + index;
      try {
        const payload = await sendFile(file, accountId, overview.competence, "preview");
        setPreviews((current) => current.map((item, itemIndex) => itemIndex === position ? {
          ...item, status: payload.needsMapping ? "mapping" : "ready", data: payload.preview,
          headers: payload.headers, error: payload.error
        } : item));
      } catch (error) {
        setPreviews((current) => current.map((item, itemIndex) => itemIndex === position ? { ...item, status: "error", error: error instanceof Error ? error.message : "Falha na leitura." } : item));
      }
    }));
  }
  async function importOne(index: number) {
    const item = previews[index];
    setPreviews((current) => current.map((entry, position) => position === index ? { ...entry, status: "importing" } : entry));
    try {
      const payload = await sendFile(item.file, item.accountId, overview.competence, "import", item.mapping);
      setPreviews((current) => current.map((entry, position) => position === index ? { ...entry, status: "done", error: payload.result?.duplicate ? "Arquivo já importado; nenhum lançamento foi duplicado." : undefined } : entry));
      await onRefresh();
    } catch (error) {
      setPreviews((current) => current.map((entry, position) => position === index ? { ...entry, status: "error", error: error instanceof Error ? error.message : "Falha na importação." } : entry));
    }
  }
  if (!overview.accounts.length) return <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
    <div className="mx-auto max-w-2xl text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"><Building2 size={22}/></div><h2 className="mt-3 font-semibold text-white">Cadastre a primeira conta financeira</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Cada extrato precisa ser associado à conta correta para que saldos, transferências e relatórios não sejam misturados.</p></div>
    <div className="mx-auto mt-5 max-w-3xl"><AccountForm onCancel={undefined} onCreated={async (account) => { await onRefresh(); setAccountId(account.id); onMessage({ tone: "success", text: "Conta cadastrada. Agora você já pode importar o extrato CSV." }); }} /></div>
  </section>;
  return <div className="space-y-4"><div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-end gap-2"><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><Field label="Conta padrão para os novos arquivos"><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{overview.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Competência"><input disabled type="month" value={overview.competence} /></Field></div><button aria-label="Cadastrar nova conta" className="focus-ring flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setCreatingAccount(true)} title="Cadastrar nova conta" type="button"><Plus size={18}/></button></div>
      <button className="focus-ring mt-4 flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 p-5 text-center transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/5" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }} type="button">
        <Upload className="mb-3 text-emerald-300" size={28} /><span className="font-medium text-zinc-200">Arraste vários extratos CSV ou selecione os arquivos</span><span className="mt-1 text-xs text-zinc-500">Nubank, Olist Conta Digital, Mercado Pago, PayPal ou CSV genérico, até 10 MB cada.</span>
      </button><input accept=".csv,text/csv" className="hidden" multiple onChange={(event) => addFiles(Array.from(event.target.files ?? []))} ref={inputRef} type="file" />
    </section>
    <section className="space-y-3">{previews.map((item, index) => <ImportPreview accounts={overview.accounts} item={item} key={`${item.file.name}-${index}`} onAccountChange={(nextAccountId) => setPreviews((current) => current.map((entry, position) => position === index ? { ...entry, accountId: nextAccountId } : entry))} onImport={() => importOne(index)} onMapping={(mapping) => setPreviews((current) => current.map((entry, position) => position === index ? { ...entry, mapping, status: "ready" } : entry))} />)}
      {!previews.length ? <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"><p className="text-sm font-medium text-zinc-300">Fluxo seguro em duas etapas</p><ol className="mt-3 space-y-2 text-xs text-zinc-500"><li>1. Detectamos a instituição e validamos os totais.</li><li>2. Você confere a prévia antes de gravar.</li><li>3. Arquivos repetidos são reconhecidos pelo checksum.</li><li>4. O original e cada linha bruta permanecem preservados.</li></ol></div> : null}
    </section>
  </div>{overview.imports.length ? <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"><h2 className="font-semibold text-white">Arquivos desta competência</h2><div className="mt-3 grid gap-2">{overview.imports.map((item)=><div className="flex flex-col gap-2 rounded-md bg-zinc-950/50 px-3 py-2 text-sm sm:flex-row sm:items-center" key={String(item.id)}><div className="min-w-0 flex-1"><p className="truncate text-zinc-300">{String(item.original_filename)}</p><p className="text-xs text-zinc-600">{String(item.source_type)} · {String(item.transaction_row_count)} movimentações · {String(item.status)}</p></div><a className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200" href={`/api/finance/imports/${item.id}/file`}><Download size={14}/>Original</a></div>)}</div></section>:null}{creatingAccount ? <Modal onClose={() => setCreatingAccount(false)} title="Nova conta financeira"><AccountForm onCancel={() => setCreatingAccount(false)} onCreated={async (account) => { setCreatingAccount(false); await onRefresh(); setAccountId(account.id); onMessage({ tone: "success", text: "Conta cadastrada e selecionada para os próximos extratos." }); }} /></Modal> : null}</div>;
}

function ImportPreview({ accounts, item, onAccountChange, onImport, onMapping }: { accounts: Account[]; item: Preview; onAccountChange: (accountId: string) => void; onImport: () => void; onMapping: (mapping: Record<string, string>) => void }) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  if (item.status === "loading") return <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400"><Loader2 className="mr-2 inline animate-spin" size={16} />Lendo {item.file.name}...</div>;
  return <div className={`rounded-lg border p-4 ${item.status === "error" ? "border-rose-500/40 bg-rose-500/5" : item.status === "done" ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/60"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{item.file.name}</p><p className="mt-1 text-xs text-zinc-500">{item.data?.adapterName ?? "Layout não reconhecido"}</p></div>{item.status === "done" ? <Check className="text-emerald-300" size={18} /> : null}</div>
    {item.status !== "done" ? <label className="mt-3 grid gap-1.5 text-xs font-medium text-zinc-400">Importar nesta conta<select className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm" disabled={item.status === "importing"} onChange={(event) => onAccountChange(event.target.value)} value={item.accountId}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : null}
    {item.data ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Mini label="Movimentações" value={item.data.transactions} /><Mini label="Informativas" value={item.data.informativeRows} /><Mini label="Entradas" value={money(item.data.inflowsCents)} /><Mini label="Saídas" value={money(item.data.outflowsCents)} /></div> : null}
    {item.status === "mapping" && item.headers ? <div className="mt-3 space-y-2">{["date", "description", "amount", "identifier"].map((field) => <label className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs" key={field}><span className="text-zinc-500">{({date:"Data",description:"Descrição",amount:"Valor",identifier:"Identificador"} as Record<string,string>)[field]}</span><select onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))} value={mapping[field] ?? ""}><option value="">Selecione...</option>{item.headers!.map((header) => <option key={header}>{header}</option>)}</select></label>)}<button className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs" disabled={!mapping.date || !mapping.description || !mapping.amount} onClick={() => onMapping(mapping)}>Usar este mapeamento</button></div> : null}
    {item.error ? <p className="mt-3 text-xs text-amber-200">{item.error}</p> : null}
    {item.data?.warnings.map((warning) => <p className="mt-2 text-xs text-amber-200" key={warning}>{warning}</p>)}
    {item.status === "ready" ? <button className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400" onClick={onImport}><ChevronRight size={15} /> Confirmar importação</button> : null}
    {item.status === "importing" ? <p className="mt-3 text-xs text-zinc-400"><Loader2 className="mr-2 inline animate-spin" size={14} />Importando em operação transacional...</p> : null}
  </div>;
}

function Transactions({ overview, onRefresh, onMessage }: PanelProps) {
  const [search, setSearch] = useState(""); const [nature, setNature] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [editing, setEditing] = useState(false);
  const filtered = useMemo(() => overview.transactions.filter((item) => (!nature || item.nature === nature) && (!search || `${item.original_description} ${item.counterparty ?? ""} ${item.account_name}`.toLowerCase().includes(search.toLowerCase()))), [overview.transactions, nature, search]);
  return <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60">
    <div className="flex flex-col gap-3 border-b border-zinc-800 p-3 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} /><input className="w-full rounded-md border border-zinc-700 py-2 pl-9 pr-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Descrição, contraparte ou conta" value={search} /></div><select className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onChange={(event) => setNature(event.target.value)} value={nature}><option value="">Todas as naturezas</option>{overview.natures.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>{selected.length ? <button className="rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => setEditing(true)}><SlidersHorizontal className="mr-2 inline" size={15} />Classificar {selected.length}</button> : null}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-950/60 text-xs uppercase text-zinc-500"><tr><th className="p-3"><input aria-label="Selecionar todos" checked={selected.length === filtered.length && filtered.length > 0} onChange={(event) => setSelected(event.target.checked ? filtered.map((item) => item.id) : [])} type="checkbox" /></th><th>Data</th><th>Descrição</th><th>Conta</th><th>Classificação</th><th className="pr-4 text-right">Valor</th></tr></thead><tbody>{filtered.map((item) => <tr className="border-t border-zinc-800/80 hover:bg-zinc-800/30" key={item.id}><td className="p-3"><input checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} type="checkbox" /></td><td className="whitespace-nowrap text-xs text-zinc-500">{dateBr(item.transaction_date)}</td><td className="max-w-md whitespace-normal py-3 pr-4"><p className="text-zinc-200">{item.original_description}</p><p className="mt-1 text-xs text-zinc-600">{item.counterparty || item.source_type}</p></td><td className="whitespace-nowrap pr-4 text-xs text-zinc-400">{item.account_name}</td><td className="pr-4"><NatureBadge nature={item.nature} natures={overview.natures} review={item.review_required && item.review_status === "pending"} /><p className="mt-1 text-xs text-zinc-600">{item.category_name ?? "Sem categoria"}</p></td><td className={`whitespace-nowrap pr-4 text-right font-semibold ${Number(item.amount_cents) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(Number(item.amount_cents))}</td></tr>)}</tbody></table></div>
    {!filtered.length ? <Empty text="Nenhum lançamento encontrado para os filtros selecionados." /> : null}
    {editing ? <ClassificationModal ids={selected} overview={overview} onClose={() => setEditing(false)} onDone={async () => { setEditing(false); setSelected([]); await onRefresh(); onMessage({ tone: "success", text: "Classificação atualizada e registrada na auditoria." }); }} /> : null}
  </section>;
}

function ClassificationModal({ ids, overview, onClose, onDone }: { ids: string[]; overview: Overview; onClose: () => void; onDone: () => void }) {
  const defaultNature=overview.natures.find((item)=>item.key==="operating_expense")??overview.natures[0]; const sample = overview.transactions.find((item) => ids.includes(item.id)); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [nature,setNature]=useState(defaultNature?.key??""); const [categoryId,setCategoryId]=useState(""); const [external,setExternal]=useState(defaultNature?.default_include_external_cash_flow??true); const [operating,setOperating]=useState(defaultNature?.default_include_operating_result??true); const [createRule,setCreateRule]=useState(false); const [needle,setNeedle]=useState(sample?.counterparty || sample?.original_description.slice(0,40) || "");
  async function submit() { setBusy(true); setError(""); try { const response=await fetch("/api/finance/transactions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({transactionIds:ids,nature,categoryId:categoryId||null,includeExternalCashFlow:external,includeOperatingResult:operating,createRule:createRule?{name:`Regra - ${needle}`.slice(0,100),descriptionContains:needle}:undefined})}); const payload=await response.json(); if(!response.ok) throw new Error(errorText(payload.error)); await onDone(); } catch(caught){setError(caught instanceof Error?caught.message:"Falha ao classificar.");} finally{setBusy(false);} }
  return <Modal title={`Classificar ${ids.length} lançamento(s)`} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><Field label="Natureza"><select value={nature} onChange={(event)=>{const selected=overview.natures.find((item)=>item.key===event.target.value);setNature(event.target.value);setOperating(selected?.default_include_operating_result??false);setExternal(selected?.default_include_external_cash_flow??true);}}>{overview.natures.map((item)=><option key={item.key} value={item.key}>{item.name}</option>)}</select></Field><Field label="Categoria"><select value={categoryId} onChange={(event)=>setCategoryId(event.target.value)}><option value="">Sem categoria</option>{overview.categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></Field></div><label className="mt-4 flex items-center gap-2 text-sm text-zinc-300"><input checked={external} onChange={(event)=>setExternal(event.target.checked)} type="checkbox"/>Incluir no fluxo de caixa externo</label><label className="mt-2 flex items-center gap-2 text-sm text-zinc-300"><input checked={operating} onChange={(event)=>setOperating(event.target.checked)} type="checkbox"/>Incluir no resultado operacional</label><div className="mt-4 rounded-md border border-zinc-800 p-3"><label className="flex items-center gap-2 text-sm text-zinc-300"><input checked={createRule} onChange={(event)=>setCreateRule(event.target.checked)} type="checkbox"/>Criar regra para os próximos meses</label>{createRule?<Field label="Descrição contém"><input value={needle} onChange={(event)=>setNeedle(event.target.value)}/></Field>:null}</div>{error?<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-100">{error}</p>:null}<button className="mt-4 w-full rounded-md bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 disabled:opacity-50" disabled={busy||!nature} onClick={submit}>{busy?<Loader2 className="mr-2 inline animate-spin" size={16}/>:null}Aplicar classificação</button></Modal>;
}

function Transfers({ overview, onRefresh, onMessage }: PanelProps) {
  async function update(id:string,status:string){const response=await fetch(`/api/finance/transfers/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});const payload=await response.json();if(!response.ok){onMessage({tone:"error",text:payload.error||"Falha ao atualizar transferência."});return;}await onRefresh();onMessage({tone:"success",text:status==="confirmed"?"Transferência confirmada e excluída do consolidado.":"Sugestão rejeitada."});}
  return <div className="space-y-3">{overview.transfers.map((item)=><div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4" key={String(item.id)}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300"><ArrowRightLeft size={18}/></div><div className="min-w-0 flex-1"><p className="text-sm text-zinc-300">{String(item.outgoing_description)}</p><p className="my-1 text-xs text-zinc-600">para</p><p className="text-sm text-zinc-300">{String(item.incoming_description)}</p></div><div className="sm:text-right"><p className="font-semibold text-white">{money(Number(item.amount_cents))}</p><p className="text-xs text-zinc-500">Confiança {Math.round(Number(item.match_score)*100)}%</p></div></div>{item.status==="suggested"?<div className="mt-3 flex flex-wrap justify-end gap-2"><button className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300" onClick={()=>update(String(item.id),"rejected")}>Não é transferência</button><button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={()=>update(String(item.id),"confirmed")}><Check className="mr-1 inline" size={15}/>Confirmar par</button></div>:<p className="mt-3 text-right text-xs text-zinc-500">Situação: {String(item.status)}</p>}</div>)}{!overview.transfers.length?<Empty text="Nenhuma transferência interna sugerida nesta competência."/>:null}</div>;
}

function OlistReconciliation({ overview, onMessage }: { overview: Overview; onMessage: (message: Message) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ external: Array<{id:string;recordType:string;date:string|null;amountCents:number|null;counterparty:string|null;status:string|null}>; suggestions:Array<{localTransactionId:string;externalId:string;score:number;reasons:string[]}> } | null>(null);
  async function search() {
    setBusy(true);
    try {
      const response = await fetch(`/api/finance/olist/search?competence=${overview.competence}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao consultar o Olist.");
      setResult(payload);
      onMessage({ tone: "success", text: `Consulta concluída: ${payload.external.length} conta(s) e ${payload.suggestions.length} correspondência(s) sugerida(s).` });
    } catch (error) { onMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao consultar o Olist." }); }
    finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">Conciliação assistida com Olist</h2><p className="mt-1 max-w-2xl text-xs text-zinc-500">Consulta contas a receber e a pagar da competência. Esta fase é somente leitura: nenhuma conta será criada, baixada ou alterada no ERP.</p></div><button className="shrink-0 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={busy} onClick={search}>{busy?<Loader2 className="mr-2 inline animate-spin" size={15}/>:<Search className="mr-2 inline" size={15}/>}Consultar Olist</button></div>{result?<div className="mt-4 grid gap-3 lg:grid-cols-2"><div><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Registros externos</h3><div className="max-h-96 space-y-2 overflow-y-auto">{result.external.map((item)=><div className="rounded-md bg-zinc-950/60 p-3 text-sm" key={`${item.recordType}-${item.id}`}><div className="flex justify-between gap-3"><span className="truncate text-zinc-300">{item.counterparty||`Registro ${item.id}`}</span><strong className="shrink-0 text-zinc-100">{item.amountCents===null?"Sem valor":money(item.amountCents)}</strong></div><p className="mt-1 text-xs text-zinc-600">{item.recordType==="accounts_receivable"?"Conta a receber":"Conta a pagar"} · {item.date||"Sem data"} · {item.status||"Sem situação"}</p></div>)}</div></div><div><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Correspondências sugeridas</h3><div className="space-y-2">{result.suggestions.map((item)=><div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3" key={`${item.localTransactionId}-${item.externalId}`}><p className="text-sm font-medium text-cyan-100">Compatibilidade {Math.round(item.score*100)}%</p><p className="mt-1 text-xs text-zinc-500">{item.reasons.join(" · ")}</p></div>)}{!result.suggestions.length?<Empty text="Nenhuma correspondência forte encontrada."/>:null}</div></div></div>:null}</section>;
}

function Categories({ onMessage, onRefresh }: { onMessage: (message: Message) => void; onRefresh: () => Promise<void> }) {
  const [categories,setCategories]=useState<ManagedCategory[]>([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<ManagedCategory|null|"new">(null);
  const [deleting,setDeleting]=useState<ManagedCategory|null>(null);
  const [showInactive,setShowInactive]=useState(false);
  async function load(){setLoading(true);try{const response=await fetch("/api/finance/categories?includeInactive=true",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));setCategories(payload.categories);}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao carregar categorias."});}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
  const roots=categories.filter((category)=>!category.parent_id&&(showInactive||category.active));
  const inactiveCount=categories.filter((category)=>!category.active).length;
  async function remove(){if(!deleting)return;try{const response=await fetch(`/api/finance/categories/${deleting.id}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));setDeleting(null);await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:Number(payload.result?.preservedTransactions)>0?`Categoria excluída das novas classificações. ${payload.result.preservedTransactions} lançamento(s) histórico(s) foram preservados.`:"Categoria excluída das novas classificações."});}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao excluir categoria."});}}
  async function reactivate(category:ManagedCategory){try{const response=await fetch(`/api/finance/categories/${category.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:category.name,type:category.type,parentId:category.parent_id,affectsOperatingResult:category.affects_operating_result,olistCategoryId:category.olist_category_id,active:true})});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:"Categoria reativada."});}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao reativar categoria."});}}
  return <div className="space-y-4"><section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"><Tags size={19}/></div><div><h2 className="font-semibold text-white">Categorias financeiras</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Organize receitas, despesas e movimentações neutras. Categorias excluídas permanecem nos lançamentos antigos para preservar o histórico.</p></div></div><button className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400" onClick={()=>setEditing("new")}><Plus size={16}/>Nova categoria</button></div></section>
    {loading?<div className="p-8 text-center text-sm text-zinc-500"><Loader2 className="mr-2 inline animate-spin" size={16}/>Carregando categorias...</div>:<div className="space-y-3">{roots.map((root)=><CategoryRow category={root} childCategories={categories.filter((item)=>item.parent_id===root.id&&(showInactive||item.active))} key={root.id} onDelete={setDeleting} onEdit={setEditing} onReactivate={reactivate}/>)}{!roots.length?<Empty text="Nenhuma categoria cadastrada."/>:null}</div>}
    {inactiveCount?<button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={()=>setShowInactive((current)=>!current)} type="button">{showInactive?"Ocultar":"Mostrar"} categorias inativas ({inactiveCount})</button>:null}
    {editing?<CategoryModal categories={categories} category={editing==="new"?null:editing} onClose={()=>setEditing(null)} onDone={async(message)=>{setEditing(null);await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:message});}}/>:null}
    {deleting?<Modal title="Excluir categoria" onClose={()=>setDeleting(null)}><div className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3"><AlertTriangle className="shrink-0 text-amber-300" size={19}/><div><p className="text-sm font-medium text-white">Excluir “{deleting.name}” das novas classificações?</p><p className="mt-1 text-xs leading-5 text-zinc-400">Os {Number(deleting.transaction_count)} lançamento(s) já classificados serão mantidos. Regras automáticas vinculadas a esta categoria serão desativadas.</p></div></div><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onClick={()=>setDeleting(null)}>Cancelar</button><button className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-500 px-3 py-2 text-sm font-semibold text-white" onClick={remove}><Trash2 size={15}/>Excluir categoria</button></div></Modal>:null}
  </div>;
}

function CategoryRow({category,childCategories,onDelete,onEdit,onReactivate}:{category:ManagedCategory;childCategories:ManagedCategory[];onDelete:(category:ManagedCategory)=>void;onEdit:(category:ManagedCategory)=>void;onReactivate:(category:ManagedCategory)=>void}){
  return <section className={`rounded-lg border bg-zinc-900/60 ${category.active?"border-zinc-800":"border-zinc-800/60 opacity-70"}`}><CategoryLine category={category} onDelete={onDelete} onEdit={onEdit} onReactivate={onReactivate}/>{childCategories.length?<div className="border-t border-zinc-800/80 bg-zinc-950/30 px-3 py-2 sm:px-4">{childCategories.map((child)=><div className="border-l border-zinc-700 pl-3" key={child.id}><CategoryLine category={child} compact onDelete={onDelete} onEdit={onEdit} onReactivate={onReactivate}/></div>)}</div>:null}</section>;
}

function CategoryLine({category,compact=false,onDelete,onEdit,onReactivate}:{category:ManagedCategory;compact?:boolean;onDelete:(category:ManagedCategory)=>void;onEdit:(category:ManagedCategory)=>void;onReactivate:(category:ManagedCategory)=>void}){
  return <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${compact?"py-2":"p-3 sm:p-4"}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`${compact?"text-sm":"font-medium"} text-white`}>{category.name}</h3><span className={`rounded px-2 py-0.5 text-[11px] ${category.type==="income"?"bg-emerald-400/10 text-emerald-200":category.type==="expense"?"bg-rose-400/10 text-rose-200":"bg-zinc-700 text-zinc-300"}`}>{categoryTypeLabel(category.type)}</span>{!category.active?<span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500">Inativa</span>:null}</div><p className="mt-1 text-xs text-zinc-500">{Number(category.transaction_count)} lançamento(s) · {category.affects_operating_result?"Compõe o resultado operacional":"Não altera o resultado operacional"}{category.olist_category_id?` · Olist ${category.olist_category_id}`:""}</p></div><div className="flex shrink-0 gap-1 self-end sm:self-auto">{category.active?<><button aria-label={`Editar ${category.name}`} className="focus-ring flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={()=>onEdit(category)} title="Editar"><Pencil size={16}/></button><button aria-label={`Excluir ${category.name}`} className="focus-ring flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300" onClick={()=>onDelete(category)} title="Excluir"><Trash2 size={16}/></button></>:<button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onClick={()=>onReactivate(category)}><RotateCcw size={14}/>Reativar</button>}</div></div>;
}

function CategoryModal({categories,category,onClose,onDone}:{categories:ManagedCategory[];category:ManagedCategory|null;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [form,setForm]=useState({name:category?.name??"",type:category?.type??"expense" as ManagedCategory["type"],parentId:category?.parent_id??"",affectsOperatingResult:category?.affects_operating_result??true,olistCategoryId:category?.olist_category_id??""});
  const roots=categories.filter((item)=>item.active&&!item.parent_id&&item.id!==category?.id);
  function setType(type:ManagedCategory["type"]){const parent=roots.find((item)=>item.id===form.parentId);setForm((current)=>({...current,type,parentId:parent&&parent.type!==type?"":current.parentId,affectsOperatingResult:type==="neutral"?false:current.affectsOperatingResult}));}
  async function submit(){setBusy(true);setError("");try{const url=category?`/api/finance/categories/${category.id}`:"/api/finance/categories";const response=await fetch(url,{method:category?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:form.name,type:form.type,parentId:form.parentId||null,affectsOperatingResult:form.affectsOperatingResult,olistCategoryId:form.olistCategoryId||null})});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));await onDone(category?"Categoria atualizada.":"Categoria criada.");}catch(caught){setError(caught instanceof Error?caught.message:"Falha ao salvar categoria.");}finally{setBusy(false);}}
  return <Modal title={category?"Editar categoria":"Nova categoria"} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nome"><input autoFocus maxLength={100} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Ex.: Matéria-prima" value={form.name}/></Field></div><Field label="Tipo"><select onChange={(event)=>setType(event.target.value as ManagedCategory["type"])} value={form.type}><option value="income">Receita</option><option value="expense">Despesa</option><option value="neutral">Neutra</option></select></Field><Field label="Categoria principal (opcional)"><select onChange={(event)=>{const parent=roots.find((item)=>item.id===event.target.value);setForm({...form,parentId:event.target.value,type:parent?.type??form.type});}} value={form.parentId}><option value="">Categoria principal</option>{roots.filter((item)=>item.type===form.type||item.id===form.parentId).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><div className="sm:col-span-2"><Field label="ID da categoria no Olist (opcional)"><input onChange={(event)=>setForm({...form,olistCategoryId:event.target.value})} placeholder="Use quando houver conciliação com o Olist" value={form.olistCategoryId}/></Field></div></div><label className="mt-4 flex items-start gap-2 rounded-md border border-zinc-800 p-3 text-sm text-zinc-300"><input checked={form.affectsOperatingResult} className="mt-0.5" disabled={form.type==="neutral"} onChange={(event)=>setForm({...form,affectsOperatingResult:event.target.checked})} type="checkbox"/><span><strong className="block font-medium text-zinc-200">Compor resultado operacional</strong><span className="mt-0.5 block text-xs leading-5 text-zinc-500">Ative para receitas e despesas próprias da operação. Transferências, aportes e dívidas normalmente não compõem esse resultado.</span></span></label>{error?<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-100">{error}</p>:null}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={busy||form.name.trim().length<2} onClick={submit}>{busy?<Loader2 className="mr-2 inline animate-spin" size={15}/>:null}{category?"Salvar alterações":"Criar categoria"}</button></div></Modal>;
}

function Natures({onMessage,onRefresh}:{onMessage:(message:Message)=>void;onRefresh:()=>Promise<void>}){
  const [natures,setNatures]=useState<ManagedNature[]>([]);const [loading,setLoading]=useState(true);const [editing,setEditing]=useState<ManagedNature|null|"new">(null);const [deleting,setDeleting]=useState<ManagedNature|null>(null);const [showInactive,setShowInactive]=useState(false);
  async function load(){setLoading(true);try{const response=await fetch("/api/finance/natures?includeInactive=true",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));setNatures(payload.natures);}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao carregar naturezas."});}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
  async function remove(){if(!deleting)return;try{const response=await fetch(`/api/finance/natures/${deleting.id}`,{method:"DELETE"});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));setDeleting(null);await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:Number(payload.result?.preservedTransactions)>0?`Natureza excluída das novas classificações. ${payload.result.preservedTransactions} lançamento(s) histórico(s) foram preservados.`:"Natureza excluída das novas classificações."});}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao excluir natureza."});}}
  async function reactivate(nature:ManagedNature){try{const response=await fetch(`/api/finance/natures/${nature.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:nature.name,type:nature.type,defaultIncludeExternalCashFlow:nature.default_include_external_cash_flow,defaultIncludeOperatingResult:nature.default_include_operating_result,active:true})});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:"Natureza reativada."});}catch(caught){onMessage({tone:"error",text:caught instanceof Error?caught.message:"Falha ao reativar natureza."});}}
  const visible=natures.filter((nature)=>showInactive||nature.active);const inactiveCount=natures.filter((nature)=>!nature.active).length;
  return <div className="space-y-4"><section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300"><SlidersHorizontal size={19}/></div><div><h2 className="font-semibold text-white">Naturezas financeiras</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Defina o significado gerencial do lançamento e os comportamentos padrão usados durante a classificação.</p></div></div><button className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400" onClick={()=>setEditing("new")}><Plus size={16}/>Nova natureza</button></div></section>
    {loading?<div className="p-8 text-center text-sm text-zinc-500"><Loader2 className="mr-2 inline animate-spin" size={16}/>Carregando naturezas...</div>:<div className="grid gap-3 lg:grid-cols-2">{visible.map((nature)=><div className={`rounded-lg border bg-zinc-900/60 p-4 ${nature.active?"border-zinc-800":"border-zinc-800/60 opacity-70"}`} key={nature.id}><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-white">{nature.name}</h3><span className={`rounded px-2 py-0.5 text-[11px] ${nature.type==="income"?"bg-emerald-400/10 text-emerald-200":nature.type==="expense"?"bg-rose-400/10 text-rose-200":"bg-zinc-700 text-zinc-300"}`}>{categoryTypeLabel(nature.type)}</span>{nature.protected?<span className="rounded bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-200">Sistema</span>:null}{!nature.active?<span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500">Inativa</span>:null}</div><p className="mt-1 text-xs text-zinc-500">{Number(nature.transaction_count)} lançamento(s)</p><div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className={`rounded px-2 py-1 ${nature.default_include_external_cash_flow?"bg-emerald-400/10 text-emerald-200":"bg-zinc-800 text-zinc-500"}`}>Fluxo externo: {nature.default_include_external_cash_flow?"sim":"não"}</span><span className={`rounded px-2 py-1 ${nature.default_include_operating_result?"bg-amber-400/10 text-amber-200":"bg-zinc-800 text-zinc-500"}`}>Resultado operacional: {nature.default_include_operating_result?"sim":"não"}</span></div></div><div className="flex shrink-0 gap-1">{nature.active?<><button aria-label={`Editar ${nature.name}`} className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={()=>setEditing(nature)} title="Editar"><Pencil size={16}/></button>{!nature.protected?<button aria-label={`Excluir ${nature.name}`} className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300" onClick={()=>setDeleting(nature)} title="Excluir"><Trash2 size={16}/></button>:null}</>:<button className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs" onClick={()=>reactivate(nature)}><RotateCcw size={14}/>Reativar</button>}</div></div></div>)}</div>}
    {inactiveCount?<button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={()=>setShowInactive((current)=>!current)}>{showInactive?"Ocultar":"Mostrar"} naturezas inativas ({inactiveCount})</button>:null}
    {editing?<NatureModal nature={editing==="new"?null:editing} onClose={()=>setEditing(null)} onDone={async(message)=>{setEditing(null);await Promise.all([load(),onRefresh()]);onMessage({tone:"success",text:message});}}/>:null}
    {deleting?<Modal title="Excluir natureza" onClose={()=>setDeleting(null)}><div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-sm font-medium text-white">Excluir “{deleting.name}” das novas classificações?</p><p className="mt-1 text-xs leading-5 text-zinc-400">Os lançamentos antigos manterão esta natureza e as regras automáticas vinculadas serão desativadas.</p></div><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onClick={()=>setDeleting(null)}>Cancelar</button><button className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-500 px-3 py-2 text-sm font-semibold text-white" onClick={remove}><Trash2 size={15}/>Excluir natureza</button></div></Modal>:null}
  </div>;
}

function NatureModal({nature,onClose,onDone}:{nature:ManagedNature|null;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [form,setForm]=useState({name:nature?.name??"",type:nature?.type??"expense" as ManagedNature["type"],external:nature?.default_include_external_cash_flow??true,operating:nature?.default_include_operating_result??true});
  async function submit(){setBusy(true);setError("");try{const response=await fetch(nature?`/api/finance/natures/${nature.id}`:"/api/finance/natures",{method:nature?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:form.name,type:form.type,defaultIncludeExternalCashFlow:form.external,defaultIncludeOperatingResult:form.operating})});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));await onDone(nature?"Natureza atualizada.":"Natureza criada.");}catch(caught){setError(caught instanceof Error?caught.message:"Falha ao salvar natureza.");}finally{setBusy(false);}}
  return <Modal title={nature?"Editar natureza":"Nova natureza"} onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nome"><input autoFocus maxLength={100} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Ex.: Investimento em equipamento" value={form.name}/></Field></div><Field label="Tipo"><select onChange={(event)=>setForm({...form,type:event.target.value as ManagedNature["type"]})} value={form.type}><option value="income">Receita</option><option value="expense">Despesa</option><option value="neutral">Neutra</option></select></Field></div><div className="mt-4 space-y-2"><label className="flex items-start gap-2 rounded-md border border-zinc-800 p-3 text-sm text-zinc-300"><input checked={form.external} className="mt-0.5" onChange={(event)=>setForm({...form,external:event.target.checked})} type="checkbox"/><span><strong className="block text-zinc-200">Incluir no fluxo de caixa externo</strong><span className="text-xs text-zinc-500">Conta como dinheiro que entrou ou saiu da empresa.</span></span></label><label className="flex items-start gap-2 rounded-md border border-zinc-800 p-3 text-sm text-zinc-300"><input checked={form.operating} className="mt-0.5" onChange={(event)=>setForm({...form,operating:event.target.checked})} type="checkbox"/><span><strong className="block text-zinc-200">Incluir no resultado operacional</strong><span className="text-xs text-zinc-500">Compõe o resultado gerencial da atividade principal.</span></span></label></div>{nature?.protected?<p className="mt-3 text-xs text-cyan-200">A chave técnica desta natureza é protegida, mas seu nome e padrões podem ser ajustados.</p>:null}{error?<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-100">{error}</p>:null}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={busy||form.name.trim().length<2} onClick={submit}>{busy?<Loader2 className="mr-2 inline animate-spin" size={15}/>:null}{nature?"Salvar alterações":"Criar natureza"}</button></div></Modal>;
}

function Accounts({ accounts, onRefresh, onMessage }: { accounts: Account[]; onRefresh:()=>Promise<void>; onMessage:(message:Message)=>void }) {
  const [open,setOpen]=useState(!accounts.length);
  return <div className="space-y-3"><div className="flex justify-end"><button className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={()=>setOpen(true)}><Plus size={16}/>Nova conta</button></div>{open?<div className="rounded-lg border border-emerald-500/30 bg-zinc-900/70 p-4"><h2 className="font-semibold text-white">Conta financeira</h2><AccountForm onCancel={()=>setOpen(false)} onCreated={async()=>{setOpen(false);await onRefresh();onMessage({tone:"success",text:"Conta financeira cadastrada."});}}/></div>:null}<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account)=><div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4" key={account.id}><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 text-zinc-300"><Building2 size={17}/></div><div><h3 className="font-medium text-white">{account.name}</h3><p className="text-xs text-zinc-500">{account.institution} · {account.currency}</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-[11px]"><span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{ownershipLabel(account.ownership_type)}</span>{account.required_for_monthly_close?<span className="rounded bg-amber-400/10 px-2 py-1 text-amber-200">Obrigatória</span>:null}{account.same_economic_entity?<span className="rounded bg-cyan-400/10 px-2 py-1 text-cyan-200">Caixa operacional</span>:null}</div></div>)}</div></div>;
}

function AccountForm({ onCancel, onCreated }: { onCancel?: () => void; onCreated: (account: Account) => Promise<void> | void }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState({name:"",institution:"nubank",accountType:"checking",currency:"BRL",ownershipType:"company",sameEconomicEntity:true,requiredForMonthlyClose:true});
  async function submit(){setBusy(true);setError("");try{const response=await fetch("/api/finance/accounts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const payload=await response.json();if(!response.ok)throw new Error(errorText(payload.error));await onCreated(payload.account as Account);}catch(caught){setError(caught instanceof Error?caught.message:"Falha ao cadastrar conta.");}finally{setBusy(false);}}
  return <div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Nome da conta"><input placeholder="Ex.: Nubank empresa" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></Field><Field label="Instituição"><select value={form.institution} onChange={(e)=>setForm({...form,institution:e.target.value})}><option value="nubank">Nubank</option><option value="olist">Olist Conta Digital</option><option value="mercado_pago">Mercado Pago</option><option value="paypal">PayPal</option><option value="other">Outra</option></select></Field><Field label="Titularidade"><select value={form.ownershipType} onChange={(e)=>setForm({...form,ownershipType:e.target.value})}><option value="company">Empresa</option><option value="owner">Titular</option><option value="partner">Sócio</option><option value="personal">Pessoal</option><option value="third_party">Terceiro</option></select></Field></div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4"><label className="flex items-center gap-2 text-sm text-zinc-300"><input checked={form.sameEconomicEntity} onChange={(e)=>setForm({...form,sameEconomicEntity:e.target.checked})} type="checkbox"/>Integra o mesmo caixa operacional</label><label className="flex items-center gap-2 text-sm text-zinc-300"><input checked={form.requiredForMonthlyClose} onChange={(e)=>setForm({...form,requiredForMonthlyClose:e.target.checked})} type="checkbox"/>Obrigatória no fechamento</label></div>{error?<p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-sm text-rose-100">{error}</p>:null}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{onCancel?<button className="rounded-md border border-zinc-700 px-3 py-2 text-sm" onClick={onCancel} type="button">Cancelar</button>:null}<button className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={busy||form.name.trim().length<2} onClick={submit} type="button">{busy?<Loader2 className="mr-1 inline animate-spin" size={15}/>:null}Salvar conta e continuar</button></div></div>;
}

function MonthAction({overview,onRefresh,onMessage}:PanelProps){const action=overview.month.status==="completed"?"reopen":"close";const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [notes,setNotes]=useState("");const [force,setForce]=useState(false);const [error,setError]=useState("");async function submit(){if(action==="reopen"&&!notes.trim()){setError("Informe o motivo da reabertura.");return;}if(force&&!notes.trim()){setError("A justificativa é obrigatória para concluir com pendências.");return;}setBusy(true);setError("");try{const response=await fetch("/api/finance/month",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({competence:overview.competence,action,force,notes})});const payload=await response.json();if(payload.result?.requiresJustification){setForce(true);setError(`Existem pendências: ${payload.result.checks.pending_reviews} revisão(ões), ${payload.result.checks.missing_accounts} conta(s) sem extrato e ${payload.result.checks.failed_imports} lote(s) com erro. Justifique para continuar.`);return;}if(!response.ok)throw new Error(payload.error);setOpen(false);await onRefresh();onMessage({tone:"success",text:action==="close"?"Competência concluída.":"Competência reaberta com auditoria."});}catch(caught){setError(caught instanceof Error?caught.message:"Falha no fechamento.");}finally{setBusy(false);}}return <><button className="mt-4 w-full rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800" onClick={()=>setOpen(true)}>{action==="reopen"?"Reabrir competência":"Concluir competência"}</button>{open?<Modal title={action==="reopen"?"Reabrir competência":"Concluir competência"} onClose={()=>setOpen(false)}><p className="text-sm text-zinc-400">{action==="reopen"?"A reabertura será registrada na auditoria e permitirá novas alterações.":"O sistema verificará contas obrigatórias, revisões e importações com erro."}</p><label className="mt-4 grid gap-1.5 text-xs font-medium text-zinc-400">{force?"Justificativa obrigatória":action==="reopen"?"Motivo":"Observação opcional"}<textarea className="min-h-24 rounded-md border border-zinc-700 p-3 text-sm" onChange={(event)=>setNotes(event.target.value)} value={notes}/></label>{error?<p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-100">{error}</p>:null}<button className="mt-4 w-full rounded-md bg-amber-400 px-3 py-2.5 font-semibold text-zinc-950 disabled:opacity-50" disabled={busy} onClick={submit}>{busy?<Loader2 className="mr-2 inline animate-spin" size={15}/>:null}{force?"Concluir com pendências":action==="reopen"?"Confirmar reabertura":"Verificar e concluir"}</button></Modal>:null}</>}

type Message={tone:"success"|"error"|"info";text:string}; type PanelProps={overview:Overview;onRefresh:()=>Promise<void>;onMessage:(message:Message)=>void};
function Metric({label,value,icon:Icon,tone,signed=false}:{label:string;value:number;icon:React.ComponentType<{size?:number}>;tone:string;signed?:boolean}){const colors:Record<string,string>={emerald:"text-emerald-300 bg-emerald-400/10",rose:"text-rose-300 bg-rose-400/10",amber:"text-amber-300 bg-amber-400/10",cyan:"text-cyan-300 bg-cyan-400/10"};return <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"><div className={`mb-4 flex h-8 w-8 items-center justify-center rounded-md ${colors[tone]}`}><Icon size={17}/></div><p className="text-xs text-zinc-500">{label}</p><p className={`mt-1 text-xl font-semibold ${signed&&value<0?"text-rose-300":"text-white"}`}>{money(value)}</p></div>}
function Bar({width,tone}:{width:number;tone:"emerald"|"rose"}){return <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${tone==="emerald"?"bg-emerald-400":"bg-rose-400"}`} style={{width:`${Math.max(width?2:0,width)}%`}}/></div>}
function ReviewLine({label,value,danger=false}:{label:string;value:string|number;danger?:boolean}){return <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-950/50 px-3 py-2 text-sm"><span className="text-zinc-400">{label}</span><strong className={danger?"text-amber-300":"text-zinc-200"}>{value}</strong></div>}
function NatureBadge({nature,natures,review}:{nature:string;natures:ManagedNature[];review:boolean}){const label=natures.find((item)=>item.key===nature)?.name??FALLBACK_NATURES.find(([id])=>id===nature)?.[1]??nature;return <span className={`inline-flex rounded px-2 py-1 text-[11px] ${review?"bg-amber-400/10 text-amber-200":nature==="internal_transfer"?"bg-cyan-400/10 text-cyan-200":"bg-zinc-800 text-zinc-300"}`}>{label}</span>}
function StatusBadge({status}:{status:string}){const labels:Record<string,string>={open:"Aberto",partial:"Parcial",review:"Em revisão",completed:"Concluído",reopened:"Reaberto"};return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status==="completed"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-200":"border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>{labels[status]??status}</span>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1.5 text-xs font-medium text-zinc-400">{label}<span className="[&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-zinc-700 [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-md [&>select]:border [&>select]:border-zinc-700 [&>select]:bg-zinc-950 [&>select]:px-3 [&>select]:py-2.5">{children}</span></label>}
function Mini({label,value}:{label:string;value:string|number}){return <div className="rounded bg-zinc-950/60 p-2"><p className="text-zinc-600">{label}</p><p className="mt-1 font-medium text-zinc-200">{value}</p></div>}
function Empty({text}:{text:string}){return <div className="p-8 text-center text-sm text-zinc-500">{text}</div>}
function Notice({tone,text,onClose}:Message&{onClose:()=>void}){return <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${tone==="error"?"border-rose-500/30 bg-rose-500/10 text-rose-100":tone==="success"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-100":"border-cyan-500/30 bg-cyan-500/10 text-cyan-100"}`}>{tone==="error"?<AlertTriangle size={17}/>:<Check size={17}/>}<p className="flex-1">{text}</p><button aria-label="Fechar" onClick={onClose}><X size={16}/></button></div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" onMouseDown={(event)=>{if(event.currentTarget===event.target)onClose();}}><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3"><h2 className="font-semibold text-white">{title}</h2><button aria-label="Fechar" onClick={onClose}><X size={18}/></button></div><div className="p-4">{children}</div></div></div>}
async function sendFile(file:File,accountId:string,competence:string,action:string,mapping?:Record<string,string>){const form=new FormData();form.set("file",file);form.set("accountId",accountId);form.set("competence",competence);form.set("action",action);if(mapping)form.set("mapping",JSON.stringify(mapping));const response=await fetch("/api/finance/imports",{method:"POST",body:form});const payload=await response.json();if(!response.ok&&!payload.needsMapping)throw new Error(payload.error||"Falha ao processar extrato.");return payload;}
function money(cents:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100)} function dateBr(value:string){return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(`${value.slice(0,10)}T12:00:00Z`))} function ownershipLabel(value:string){return ({company:"Empresa",owner:"Titular",partner:"Sócio",personal:"Pessoal",third_party:"Terceiro"} as Record<string,string>)[value]??value} function errorText(error:unknown){if(typeof error==="string")return error;if(error&&typeof error==="object")return JSON.stringify(error);return "Dados inválidos."}
function categoryTypeLabel(value:ManagedCategory["type"]){return ({income:"Receita",expense:"Despesa",neutral:"Neutra"} as const)[value]}
