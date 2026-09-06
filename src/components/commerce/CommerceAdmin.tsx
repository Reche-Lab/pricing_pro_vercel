"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Eye,
  Plus,
  Save,
  Store,
  Trash2,
  X,
} from "lucide-react";
import type { getCommerceAdmin } from "@/repositories/commerce";
import type { StoreAdminInput, StoreSettings } from "@/domain/commerce/schemas";
import { storeRequest, storeMoney } from "./store-http";
import { CommerceImageUpload } from "./CommerceImageUpload";
import { StoreBannersEditor } from "./StoreBannersEditor";
import { CommerceProductMediaEditor } from "./CommerceProductMediaEditor";
type Data = Awaited<ReturnType<typeof getCommerceAdmin>>;
const field =
  "min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
const button =
  "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
export function CommerceAdmin({
  initial,
  tenantName,
}: {
  initial: Data;
  tenantName: string;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("store");
  const [busy, setBusy] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const imageBusyChanged = (uploading: boolean) =>
    setPendingUploads((count) => Math.max(0, count + (uploading ? 1 : -1)));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(Boolean(initial.store?.enabled));
  const [status, setStatus] = useState<StoreAdminInput["status"]>(
    initial.store?.status ?? "draft",
  );
  const [platformId, setPlatformId] = useState(
    initial.store?.platform_id ?? initial.platforms[0]?.id ?? "",
  );
  const defaults: StoreSettings = {
    name: tenantName,
    description: "Produtos personalizados com a sua identidade.",
    logoUrl: "",
    bannerUrl: "",
    accent: "#047857",
    contactEmail: "",
    contactPhone: "",
    pickupEnabled: false,
    pickupAddress: "",
    deliveryEnabled: false,
    deliveryCents: 0,
    deliveryDescription: "",
    terms: "",
  };
  const [settings, setSettings] = useState<StoreSettings>({
    ...defaults,
    ...initial.store?.settings,
  });
  const [publications, setPublications] = useState<StoreAdminInput["products"]>(
    initial.products.map((p) => {
      const {
        variantId,
        name,
        description,
        category,
        imageUrl,
        media,
        minQuantity,
        maxQuantity,
        maxArtworks,
        personalized,
        pricingRule,
      } = p.snapshot;
      return {
        variantId,
        name,
        description,
        category,
        imageUrl,
        media,
        minQuantity,
        maxQuantity,
        maxArtworks,
        personalized,
        pricingRule,
        active: p.active,
      };
    }),
  );
  const [variantId, setVariantId] = useState("");
  const [manualEnabled, setManualEnabled] = useState(
    Boolean(initial.payments?.manual_enabled),
  );
  const [instructions, setInstructions] = useState(
    initial.payments?.manual_instructions ?? "",
  );
  const [mpEnabled, setMpEnabled] = useState(
    Boolean(initial.payments?.mp_enabled),
  );
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [orderAction, setOrderAction] = useState<{
    id: string;
    action: string;
    label: string;
  } | null>(null);
  const [note, setNote] = useState("");
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setData(await storeRequest("/api/commerce/admin"));
      setMessage("Alterações salvas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  function updateSetting<K extends keyof StoreSettings>(
    key: K,
    value: StoreSettings[K],
  ) {
    setSettings((old) => ({ ...old, [key]: value }));
  }
  function addProduct() {
    const v = data.variants.find((v) => v.id === variantId);
    if (!v || publications.some((p) => p.variantId === v.id)) return;
    setPublications([
      ...publications,
      {
        variantId: v.id,
        name: v.name,
        description: "",
        category: v.category,
        imageUrl: "",
        active: false,
        minQuantity: 1,
        maxQuantity: 1000,
        maxArtworks: 10,
        personalized: true,
        pricingRule: "per_art",
      },
    ]);
    setVariantId("");
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (pendingUploads) return;
    void perform(async () => {
      await storeRequest("/api/commerce/admin", "PUT", {
        enabled,
        status,
        platformId,
        settings,
        products: publications,
      });
    });
  }
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Store className="text-emerald-300" size={25} />
          <div>
            <p className="font-semibold">{tenantName}</p>
            <p className="text-xs text-zinc-500">
              {data.store?.enabled
                ? data.store.status === "published"
                  ? "Loja publicada"
                  : "Loja não publicada"
                : "Módulo desativado neste tenant"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.store?.tenant_id ? (
            <Link
              className={button}
              target="_blank"
              rel="noopener"
              href={`/commerce/${data.store.slug}/preview`}
            >
              <Eye size={16} /> Pré-visualizar loja
            </Link>
          ) : (
            <span className="text-xs text-zinc-500">
              Salve o rascunho para pré-visualizar.
            </span>
          )}
          {data.store?.enabled && data.store.status === "published" ? (
            <Link
              className={button}
              target="_blank"
              href={`/loja/${data.store.slug}`}
            >
              Abrir loja
              <ExternalLink size={15} />
            </Link>
          ) : null}
        </div>
      </div>
      <nav
        className="flex gap-2 overflow-x-auto"
        aria-label="Administração da loja"
      >
        {[
          ["store", "Loja e catálogo"],
          ["payments", "Pagamentos"],
          ["orders", `Pedidos (${data.orders.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            disabled={pendingUploads > 0}
            onClick={() => setTab(id)}
            className={`${button} whitespace-nowrap ${tab === id ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "text-zinc-400"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {message ? (
        <p
          role="status"
          className="rounded-md border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-200"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {tab === "store" ? (
        <form onSubmit={save} className="space-y-6">
          <fieldset
            disabled={busy || pendingUploads > 0}
            className="min-w-0 space-y-6"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Habilitar loja deste tenant
              </label>
              <label className="grid gap-1 text-sm">
                Publicação
                <select
                  className={field}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicada</option>
                  <option value="paused">Pausada</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Canal de preços
                <select
                  className={field}
                  value={platformId}
                  onChange={(e) => setPlatformId(e.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {data.platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <section className="grid gap-4 border-t border-zinc-800 pt-5 sm:grid-cols-2">
              <h2 className="font-semibold sm:col-span-2">
                Identidade e atendimento
              </h2>
              {(
                [
                  { key: "name", label: "Nome da loja" },
                  { key: "contactEmail", label: "E-mail de atendimento" },
                  { key: "contactPhone", label: "Telefone / WhatsApp" },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="grid gap-1 text-sm">
                  {label}
                  <input
                    className={field}
                    value={settings[key]}
                    onChange={(e) => updateSetting(key, e.target.value)}
                    type={key === "contactEmail" ? "email" : "text"}
                    required={key === "name" || key === "contactEmail"}
                  />
                </label>
              ))}
              <CommerceImageUpload
                label="Logo da loja"
                purpose="logo"
                value={settings.logoUrl}
                onChange={(url) => updateSetting("logoUrl", url)}
                onBusyChange={imageBusyChanged}
              />
              <CommerceImageUpload
                label="Capa padrão (sem carrossel)"
                purpose="cover"
                value={settings.bannerUrl}
                onChange={(url) => updateSetting("bannerUrl", url)}
                onBusyChange={imageBusyChanged}
              />
              <label className="grid gap-1 text-sm">
                Tema inicial da loja
                <select
                  className={field}
                  value={settings.theme ?? "system"}
                  onChange={(event) =>
                    updateSetting(
                      "theme",
                      event.target.value as StoreSettings["theme"],
                    )
                  }
                >
                  <option value="system">Automático (dispositivo)</option>
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Cor dos botões
                <input
                  aria-label="Cor dos botões"
                  type="color"
                  className="h-10 w-16 rounded-md border border-zinc-700"
                  value={settings.accent}
                  onChange={(e) => updateSetting("accent", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                Descrição da loja
                <textarea
                  className={field}
                  value={settings.description}
                  onChange={(e) => updateSetting("description", e.target.value)}
                  maxLength={500}
                />
              </label>
            </section>
            <StoreBannersEditor
              banners={settings.banners ?? []}
              onChange={(banners) => updateSetting("banners", banners)}
              categories={[
                ...new Set(publications.map((product) => product.category)),
              ]}
              uploading={pendingUploads > 0}
              onBusyChange={imageBusyChanged}
            />
            <section className="space-y-4 border-t border-zinc-800 pt-5">
              <h2 className="font-semibold">Entrega do piloto</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.pickupEnabled}
                  onChange={(e) =>
                    updateSetting("pickupEnabled", e.target.checked)
                  }
                />
                Permitir retirada gratuita
              </label>
              {settings.pickupEnabled ? (
                <label className="grid gap-1 text-sm">
                  Endereço e horário de retirada
                  <input
                    className={field}
                    value={settings.pickupAddress}
                    onChange={(e) =>
                      updateSetting("pickupAddress", e.target.value)
                    }
                  />
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.deliveryEnabled}
                  onChange={(e) =>
                    updateSetting("deliveryEnabled", e.target.checked)
                  }
                />
                Oferecer entrega com preço fixo
              </label>
              {settings.deliveryEnabled ? (
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <label className="grid gap-1 text-sm">
                    Frete fixo (R$)
                    <input
                      className={field}
                      inputMode="decimal"
                      defaultValue={(settings.deliveryCents / 100).toFixed(2)}
                      onBlur={(e) =>
                        updateSetting(
                          "deliveryCents",
                          Math.round(
                            Number(e.target.value.replace(",", ".")) * 100,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Prazo e condições da entrega
                    <input
                      className={field}
                      value={settings.deliveryDescription}
                      onChange={(e) =>
                        updateSetting("deliveryDescription", e.target.value)
                      }
                    />
                  </label>
                </div>
              ) : null}
              <p className="text-xs text-zinc-500">
                Esta versão não cota transportadoras automaticamente. Publique
                somente uma modalidade que sua operação consiga atender.
              </p>
              <label className="grid gap-1 text-sm">
                Condições de compra, produção, entrega e privacidade
                <textarea
                  className={`${field} min-h-28`}
                  value={settings.terms}
                  onChange={(e) => updateSetting("terms", e.target.value)}
                />
              </label>
            </section>
            <section className="space-y-4 border-t border-zinc-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">
                  Catálogo público ({publications.length})
                </h2>
                <div className="flex min-w-0 gap-2">
                  <select
                    className={field}
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                  >
                    <option value="">Escolher produto cadastrado</option>
                    {data.variants
                      .filter(
                        (v) => !publications.some((p) => p.variantId === v.id),
                      )
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                  <button
                    title="Adicionar publicação"
                    aria-label="Adicionar publicação"
                    className={button}
                    disabled={!variantId}
                    type="button"
                    onClick={addProduct}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              {publications.map((publication, index) => {
                const update = (patch: Partial<typeof publication>) =>
                  setPublications((old) =>
                    old.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                  );
                return (
                  <details
                    key={publication.variantId}
                    className="rounded-lg border border-zinc-700 bg-zinc-900/40"
                  >
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      {publication.name}{" "}
                      <span
                        className={`ml-3 text-xs ${publication.active ? "text-emerald-300" : "text-zinc-500"}`}
                      >
                        {publication.active ? "Visível ao publicar" : "Oculto"}
                      </span>
                    </summary>
                    <div className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        Nome público
                        <input
                          className={field}
                          value={publication.name}
                          onChange={(e) => update({ name: e.target.value })}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Categoria
                        <input
                          className={field}
                          value={publication.category}
                          onChange={(e) => update({ category: e.target.value })}
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <CommerceProductMediaEditor
                          productId={publication.variantId}
                          media={publication.media}
                          imageUrl={publication.imageUrl}
                          onChange={update}
                          onBusyChange={imageBusyChanged}
                        />
                      </div>
                      <label className="grid gap-1 text-sm sm:col-span-2">
                        Descrição pública
                        <textarea
                          className={field}
                          value={publication.description}
                          onChange={(e) =>
                            update({ description: e.target.value })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={publication.active}
                          onChange={(e) => update({ active: e.target.checked })}
                        />
                        Publicar este produto
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={publication.personalized}
                          onChange={(e) =>
                            update({ personalized: e.target.checked })
                          }
                        />
                        Exigir arte personalizada aprovada
                      </label>
                      {(
                        [
                          { key: "minQuantity", label: "Quantidade mínima" },
                          { key: "maxQuantity", label: "Quantidade máxima" },
                          { key: "maxArtworks", label: "Máximo de artes" },
                        ] as const
                      ).map(({ key, label }) => (
                        <label key={key} className="grid gap-1 text-sm">
                          {label}
                          <input
                            className={field}
                            inputMode="numeric"
                            defaultValue={publication[key]}
                            onBlur={(e) =>
                              update({ [key]: Number(e.target.value) })
                            }
                          />
                        </label>
                      ))}
                      <label className="grid gap-1 text-sm">
                        Base do preço
                        <select
                          className={field}
                          value={publication.pricingRule}
                          onChange={(e) =>
                            update({
                              pricingRule: e.target
                                .value as typeof publication.pricingRule,
                            })
                          }
                        >
                          <option value="per_art">Quantidade por arte</option>
                          <option value="total">
                            Quantidade total do produto
                          </option>
                          <option value="average">
                            Média de unidades por arte
                          </option>
                        </select>
                      </label>
                      <button
                        className={`${button} justify-self-start text-rose-300`}
                        type="button"
                        disabled={pendingUploads > 0}
                        onClick={() =>
                          setPublications(
                            publications.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={15} />
                        Remover da publicação
                      </button>
                    </div>
                  </details>
                );
              })}
            </section>
          </fieldset>
          <div className="sticky bottom-3 flex justify-end">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-emerald-400 px-5 py-3 font-semibold text-emerald-950 shadow-lg disabled:opacity-50"
              disabled={busy || pendingUploads > 0}
            >
              <Save size={17} />
              {pendingUploads
                ? "Aguarde o envio das imagens…"
                : busy
                  ? "Salvando…"
                  : "Salvar loja e catálogo"}
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Os preços são copiados do canal e das curvas ao salvar esta
            publicação. Alterações posteriores no precificador só chegam à loja
            após salvar novamente.
          </p>
        </form>
      ) : null}
      {tab === "payments" ? (
        <form
          className="max-w-2xl space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await storeRequest("/api/commerce/admin/payments", "PUT", {
                manualEnabled,
                manualInstructions: instructions,
                mpEnabled,
                accessToken: token || undefined,
                webhookSecret: secret || undefined,
              });
              setToken("");
              setSecret("");
            });
          }}
        >
          <h2 className="font-semibold">Recebimento das vendas desta loja</h2>
          <p className="text-sm text-zinc-400">
            Salve a loja antes de configurar pagamentos. A conexão abaixo é
            exclusiva deste tenant e não utiliza o Mercado Pago da assinatura.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualEnabled}
              onChange={(e) => setManualEnabled(e.target.checked)}
            />
            Pagamento combinado com a loja
          </label>
          <label className="grid gap-1 text-sm">
            Instruções ao comprador (Pix, transferência ou atendimento)
            <textarea
              className={`${field} min-h-24`}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <div className="space-y-4 border-t border-zinc-800 pt-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mpEnabled}
                onChange={(e) => setMpEnabled(e.target.checked)}
              />
              Mercado Pago Checkout Pro
            </label>
            <p className="text-xs text-zinc-500">
              {data.payments?.mp_configured
                ? "Credenciais armazenadas. Deixe os campos vazios para mantê-las."
                : "Piloto por credencial do vendedor. OAuth será uma etapa posterior."}
            </p>
            <label className="grid gap-1 text-sm">
              Access token do vendedor
              <input
                type="password"
                autoComplete="new-password"
                className={field}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Chave secreta de assinatura dos webhooks
              <input
                type="password"
                autoComplete="new-password"
                className={field}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
            <p className="break-all text-xs text-zinc-400">
              Webhook:{" "}
              {typeof window !== "undefined" ? window.location.origin : ""}
              /api/store/{data.store?.slug}/payment-webhook
            </p>
          </div>
          <button className={button} disabled={busy || !data.store?.tenant_id}>
            <Save size={16} />
            Salvar meios de pagamento
          </button>
        </form>
      ) : null}
      {tab === "orders" ? (
        <section className="space-y-4">
          <h2 className="font-semibold">Últimos pedidos</h2>
          {!data.orders.length ? (
            <p className="py-8 text-sm text-zinc-500">
              Nenhum pedido recebido ainda.
            </p>
          ) : (
            data.orders.map((order) => (
              <article
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {order.customer?.name} ·{" "}
                    {order.id.slice(0, 8).toUpperCase()}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {order.payment_status === "paid"
                      ? "Pago"
                      : order.payment_status === "refunded"
                        ? "Estornado"
                        : "Pagamento pendente"}{" "}
                    · {order.fulfillment_status} ·{" "}
                    {storeMoney(order.total_cents)}
                  </p>
                  <Link
                    className="mt-2 inline-block text-xs text-emerald-300 underline"
                    href={`/commerce/orders/${order.id}`}
                  >
                    Ver itens, artes e entrega
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.provider === "manual" &&
                  order.payment_status === "pending" ? (
                    <button
                      className={button}
                      onClick={() => {
                        setOrderAction({
                          id: order.id,
                          action: "confirm_manual",
                          label: "Confirmar pagamento recebido",
                        });
                        setNote("");
                      }}
                    >
                      <Check size={15} />
                      Confirmar pagamento
                    </button>
                  ) : null}
                  {order.payment_status === "paid" &&
                  order.fulfillment_status !== "completed" ? (
                    <button
                      className={button}
                      onClick={() => {
                        const next = (
                          {
                            received: ["production", "Iniciar produção"],
                            production: ["shipped", "Marcar como enviado"],
                            shipped: ["completed", "Concluir pedido"],
                          } as Record<string, string[]>
                        )[order.fulfillment_status];
                        if (next) {
                          setOrderAction({
                            id: order.id,
                            action: next[0],
                            label: next[1],
                          });
                          setNote("");
                        }
                      }}
                    >
                      Avançar etapa
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}
      {orderAction ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="commerce-action-title"
            className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await storeRequest(
                  `/api/commerce/admin/orders/${orderAction.id}`,
                  "POST",
                  { action: orderAction.action, note },
                );
                setOrderAction(null);
              });
            }}
          >
            <div className="flex items-center justify-between">
              <h2 id="commerce-action-title" className="font-semibold">
                {orderAction.label}
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                disabled={busy}
                onClick={() => setOrderAction(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-zinc-400">
              A ação ficará registrada no histórico deste pedido.
            </p>
            <label className="grid gap-2 text-sm">
              Observação
              <textarea
                className={field}
                minLength={5}
                maxLength={500}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <button className={button} disabled={busy}>
              Confirmar
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
