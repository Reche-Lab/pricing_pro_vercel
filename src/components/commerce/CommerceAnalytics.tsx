"use client";
import React, { useEffect, useRef, useState } from "react";
import { BarChart3, Check, ChevronDown, ExternalLink, HelpCircle, RefreshCw, Save, Settings2, ShieldCheck } from "lucide-react";
import { defaultAnalyticsSettings, type AnalyticsSettings, type AnalyticsReportQuery } from "@/domain/commerce/analytics";
import type { CommerceAnalyticsReport } from "@/repositories/commerce-analytics";
import { storeMoney, storeRequest } from "./store-http";
import styles from "./commerce-analytics.module.css";
import { EditableNumberInput } from "@/components/ui/EditableNumberInput";

const field = "min-h-11 min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
const count = (value: number) => value.toLocaleString("pt-BR");
const dayLabel = (day: string) => new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function CommerceAnalytics() {
  const [days, setDays] = useState<AnalyticsReportQuery["days"]>("30"), [environment, setEnvironment] = useState<AnalyticsReportQuery["environment"]>("production");
  const [settings, setSettings] = useState<AnalyticsSettings>(defaultAnalyticsSettings), [report, setReport] = useState<CommerceAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [configure, setConfigure] = useState(false), [revision, reload] = useState(0), [selectedDay, setSelectedDay] = useState("");
  const [metric, setMetric] = useState<"paidCents" | "orders" | "quotes">("paidCents");
  const dirty = useRef(false), saveLock = useRef(false);
  const chartScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (report && report.daily.length > 30 && chartScroll.current) chartScroll.current.scrollLeft = chartScroll.current.scrollWidth; }, [report]);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setReport(null);
    void storeRequest(`/api/commerce/admin/analytics?days=${days}&environment=${environment}`).then(data => {
      if (!active) return;
      setReport(data.report);
      if (!dirty.current) setSettings(data.settings);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as métricas."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, environment, revision]);
  function change<K extends keyof AnalyticsSettings>(key: K, value: AnalyticsSettings[K]) { dirty.current = true; setMessage(""); setSettings(current => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await storeRequest("/api/commerce/admin/analytics", "PUT", settings);
      dirty.current = false; setSettings(result.settings); setMessage("Configuração de métricas salva. A aceitação dos cookies continua sendo opcional para o cliente."); reload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const summary = report?.summary, selected = report?.daily.find(day => day.day === selectedDay) ?? report?.daily.at(-1);
  const max = Math.max(1, ...(report?.daily.map(day => day[metric]) ?? []));
  const gaUrl = settings.propertyId ? `https://analytics.google.com/analytics/web/#/p${settings.propertyId}/reports/reportinghub` : "https://analytics.google.com/";
  return <section className={styles.root} aria-label="Métricas e Google Analytics">
    <header className={styles.header}><div><h2><BarChart3 size={22}/>Métricas da loja</h2><p>Da intenção de orçamento ao pagamento confirmado.</p></div><button type="button" className={styles.button} onClick={() => reload(value => value + 1)} disabled={loading || saving} title="Atualizar indicadores"><RefreshCw size={16} className={loading ? "animate-spin" : undefined}/>Atualizar</button></header>
    <div className={styles.integration}><span><ShieldCheck size={18}/>{settings.enabled ? "GA4 configurado · sujeito ao consentimento" : "Google Analytics desativado"}</span><div><button type="button" className={styles.button} onClick={() => setConfigure(value => !value)} aria-expanded={configure}><Settings2 size={16}/>Configurar GA4</button><a className={styles.button} href={gaUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Abrir GA4</a></div></div>
    {configure ? <form onSubmit={event => void save(event)} className={styles.configuration} aria-label="Configuração do Google Analytics 4">
      <div className={styles.fields}><label>ID de medição GA4<input className={field} value={settings.measurementId} placeholder="G-XXXXXXXXXX" onChange={event => change("measurementId", event.target.value)} maxLength={22}/></label><label>ID da propriedade (opcional)<input className={field} inputMode="numeric" value={settings.propertyId} placeholder="Ex.: 123456789" onChange={event => change("propertyId", event.target.value.replace(/\D/g, ""))} maxLength={15}/></label><label>Sem atividade por quantas horas?<EditableNumberInput className={field} min={1} max={168} value={settings.abandonmentHours} onValueChange={value => change("abandonmentHours", value)}/></label></div>
      <div className={styles.checks}><label><input type="checkbox" checked={settings.enabled} onChange={event => change("enabled", event.target.checked)}/>Ativar métricas opcionais do Google Analytics</label><label><input type="checkbox" checked={settings.debug} onChange={event => change("debug", event.target.checked)}/>Modo de validação no DebugView</label></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={settings.privacyReviewed} onChange={event => change("privacyReviewed", event.target.checked)}/>Revisei a política de privacidade e desativei a coleta automática no fluxo GA4 conforme os passos abaixo.</label>
      <p className={styles.hint}>Use somente o ID desta loja. Não são necessários senha Google, Access Token ou chave privada. Não instale outra tag GA4/GTM para os mesmos eventos.</p>
      <details><summary><HelpCircle size={16}/>Passos de configuração e privacidade<ChevronDown size={16}/></summary><ol><li>No GA4, crie ou escolha uma propriedade e um fluxo Web para o domínio da loja. Copie o ID de medição G-….</li><li>Nas configurações do fluxo Web, desative a medição otimizada automática de páginas, formulários, buscas e downloads: estes fluxos são medidos explicitamente pela loja. Ative a redação de dados do Google para e-mails e parâmetros sensíveis.</li><li>Revise a política de privacidade da empresa antes de ativar. O visitante pode recusar e mudar sua escolha no rodapé; sinais de privacidade do navegador são respeitados.</li><li>Para validar, habilite temporariamente o DebugView, abra a loja publicada e aceite as métricas. A prévia privada e o modo de pagamento de teste não enviam eventos.</li><li>Cadastre customer_state e journey como dimensões personalizadas de escopo de evento, se desejar separar identificado/visitante e orçamento/compra nos relatórios.</li></ol></details>
      <button className={styles.save} disabled={loading || saving}><Save size={16}/>{saving ? "Salvando…" : "Salvar métricas"}</button>
    </form> : null}
    {message ? <p role="status" className={styles.success}><Check size={16}/>{message}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.filters}><div role="group" aria-label="Período do relatório">{(["7", "30", "90"] as const).map(value => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} dias</button>)}</div><label>Ambiente<select className={field} value={environment} onChange={event => setEnvironment(event.target.value as typeof environment)}><option value="production">Produção</option><option value="test">Teste</option><option value="all">Todos, inclusive históricos</option></select></label></div>
    {loading ? <div className={styles.loading} role="status">Carregando os indicadores da loja…</div> : summary && report ? <>
      <div className={styles.metrics}>{[
        ["Recebido em pedidos", storeMoney(summary.paidCents), `${count(summary.paidOrders)} pedidos pagos · inclui frete`],
        ["Aguardando pagamento", storeMoney(summary.pendingCents), `${count(summary.pendingOrders)} pedidos pendentes`],
        ["Orçamentos salvos", count(summary.quotes), `${storeMoney(summary.quoteCents)} em documentos emitidos`],
        ["Ticket médio pago", storeMoney(summary.paidOrders ? Math.round(summary.paidCents / summary.paidOrders) : 0), `${count(summary.refundedOrders)} pedidos estornados fora do recebido`],
      ].map(([label, value, help]) => <article key={label} className={styles.metric}><h3>{label}</h3><strong>{value}</strong><p>{help}</p></article>)}</div>
      <section className={styles.section}><div className={styles.sectionHeading}><h3>Evolução diária</h3><select aria-label="Indicador do gráfico" className={field} value={metric} onChange={event => setMetric(event.target.value as typeof metric)}><option value="paidCents">Recebido</option><option value="orders">Pedidos criados</option><option value="quotes">Orçamentos salvos</option></select></div><div ref={chartScroll} className={styles.chartScroll}><div className={styles.chart} style={{ minWidth: report.daily.length > 30 ? report.daily.length * 8 : 0 }}>{report.daily.map(day => <button type="button" key={day.day} className={styles.barButton} aria-pressed={selected?.day === day.day} aria-label={`${dayLabel(day.day)}: ${metric === "paidCents" ? storeMoney(day[metric]) : count(day[metric])}`} title={`${dayLabel(day.day)} · ${metric === "paidCents" ? storeMoney(day[metric]) : count(day[metric])}`} onClick={() => setSelectedDay(day.day)}><span style={{ height: `${Math.max(1, day[metric] / max * 100)}%` }}/></button>)}</div></div><div className={styles.chartAxis}><span>{report.daily[0] ? dayLabel(report.daily[0].day) : ""}</span><span>{report.daily.at(-1) ? dayLabel(report.daily.at(-1)!.day) : ""}</span></div>{selected ? <div className={styles.dayDetails} aria-live="polite"><strong>{dayLabel(selected.day)}</strong><span>{storeMoney(selected.paidCents)} recebidos</span><span>{count(selected.orders)} pedidos</span><span>{count(selected.quotes)} orçamentos</span></div> : null}</section>
      <div className={styles.columns}><section className={styles.section}><h3>Rascunhos e carrinhos em aberto</h3><dl className={styles.breakdown}><div><dt>Carrinhos sem login</dt><dd>{count(summary.guestCarts)}</dd></div><div><dt>Carrinhos identificados</dt><dd>{count(summary.identifiedCarts)}</dd></div><div><dt>Rascunhos de orçamento sem login</dt><dd>{count(summary.guestQuoteDrafts)}</dd></div><div><dt>Rascunhos de orçamento identificados</dt><dd>{count(summary.identifiedQuoteDrafts)}</dd></div><div className={styles.attention}><dt>Possível abandono de compra <small>Sem alteração há pelo menos {report.abandonmentHours} h</small></dt><dd>{count(summary.abandonedCarts)}</dd></div></dl><p className={styles.hint}>Rascunhos são um subconjunto dos carrinhos, não devem ser somados. A classificação usa a última edição dos produtos. Orçamentos completos exigem login.</p></section>
      <section className={styles.section}><h3>Produtos em pedidos pagos</h3>{report.products.length ? <div className={styles.tableScroll}><table><thead><tr><th>Produto</th><th>Unidades</th><th>Itens vendidos</th></tr></thead><tbody>{report.products.map((product, index) => <tr key={`${product.name}:${index}`}><td>{product.name}</td><td>{count(product.quantity)}</td><td>{storeMoney(product.totalCents)}</td></tr>)}</tbody></table></div> : <p className={styles.hint}>Nenhum produto com pagamento confirmado neste período.</p>}</section></div>
      {summary.legacyQuotes > 0 ? <p className={styles.hint}>{count(summary.legacyQuotes)} orçamentos anteriores não têm ambiente identificável. Estão disponíveis no filtro “Todos, inclusive históricos”. Carrinhos antigos só ganham data confiável de atividade após a próxima alteração.</p> : null}
    </> : null}
    <p className={styles.source}>Fonte deste painel: banco da loja, não relatórios do Google. Período por data de criação dos pedidos/orçamentos e última edição dos carrinhos, em horário de Brasília. Visitas, canais de aquisição e funis de navegação ficam no GA4 e podem ter cobertura menor por consentimento ou bloqueadores.</p>
  </section>;
}
