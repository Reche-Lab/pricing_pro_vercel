import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";
import { assistantProposalSchema, type AssistantCard, type AssistantProduct } from "@/domain/commerce/assistant";
import { calculateCart, CommerceError, distributeQuantity } from "@/domain/commerce/commerce";
import { rankProductCandidates, productSearchRequiresClarification } from "@/domain/products/product-search";
import { deliveryEstimate } from "@/domain/shipping/production-lead-time";
import { commerceProducts, publicCommerceProduct, calculateCommerceCart, commerceTransaction, hashCommerceToken, type BuyerSession, type CommerceStore } from "@/repositories/commerce";
import { addAssistantMessage, assistantAudit, assistantDocuments, requireAssistantConversation, type AssistantConfig } from "@/repositories/commerce-assistant";
import { listBuyerQuotes } from "@/repositories/commerce-buyer-quotes";
import { publicCarrierDelivery } from "./carrier-delivery";
import { sortShippingOptions, type StoreShippingOption } from "@/domain/commerce/shipping-options";
import type { CartLine } from "@/domain/commerce/schemas";
import { assistantArtworkBenefit, assistantStoreGuide } from "@/domain/commerce/assistant-guide";

export type AssistantToolContext = { store: CommerceStore; session: BuyerSession; config: AssistantConfig; conversationId: string };
type ProposedAction = { version: 2; revision: number; configRevision: number; lines: CartLine[]; pricingHash: string };
const empty = { type: "object", properties: {}, required: [], additionalProperties: false };
const tool = (name: string, description: string, parameters: object = empty) => ({ type: "function", function: { name, description, parameters } });
export const assistantToolDefinitions = [
  tool("search_products", "Buscar e comparar SOMENTE produtos publicados desta loja. Use nomes aproximados, categoria, medida ou finalidade; resultado com cards oficiais.", { type: "object", properties: { query: { type: "string", maxLength: 120 } }, required: ["query"], additionalProperties: false }),
  tool("prepare_quote", "Propor quantidades FINAIS desejadas por produto no rascunho. Cada produto aparece uma vez. quantity não é incremento: se já há 50 e o cliente quer mais 20 do MESMO produto, envie 70. Produtos não mencionados são preservados. Repetir 50 não soma outros 50. Não modifica nada até confirmação do cliente; não altera artes existentes.", { type: "object", properties: { items: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 50000 }, artworks: { type: "integer", minimum: 1, maximum: 10 }, artworkName: { type: "string", maxLength: 80 } }, required: ["productId", "quantity", "artworks", "artworkName"], additionalProperties: false } } }, required: ["items"], additionalProperties: false }),
  tool("estimate_delivery", "Consultar frete e produção para itens informados, sem alterar carrinho. É estimativa, não compromisso de data; dados finais serão confirmados no formulário.", { type: "object", properties: { postalCode: { type: "string", pattern: "^[0-9]{8}$" }, items: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer" }, artworks: { type: "integer" }, artworkName: { type: "string" } }, required: ["productId", "quantity", "artworks", "artworkName"], additionalProperties: false } } }, required: ["postalCode", "items"], additionalProperties: false }),
  tool("company_information", "Disponibilizar ficha cadastral, CNPJ/endereço e documentos oficiais. Os números bancários NÃO vão para o modelo: somente para o card seguro do cliente."),
  tool("my_orders", "Consultar somente pedidos da conta autenticada; exige identificação por e-mail. Não aceita ID de cliente ou email como parâmetro."),
  tool("my_quotes", "Consultar somente orçamentos da conta autenticada; exige identificação."),
  tool("view_cart", "Consultar os itens e a composição do carrinho atual sem alterações. Use quando o cliente já tem produtos no carrinho e quer um orçamento, sem adicioná-los novamente."),
  tool("continue_quote", "Mostrar o botão oficial para continuar o orçamento, validar e-mail e preencher dados no formulário da loja. Use quando o cliente autorizar seguir/finalizar o orçamento. Não cria, confirma ou altera itens; não invente links no texto."),
  tool("store_guide", "Consultar funcionalidades ATIVAS e atalhos reais desta loja. Use artwork para criação no estúdio, envio, retoque, enquadramento, aprovação, artes prontas e desconto por arte pronta; shopping para orçamento sem compromisso, PDF, compra, conta e entrega; policies para condições. Benefícios vêm dos produtos publicados, nunca assuma um percentual.", { type: "object", properties: { topic: { type: "string", enum: ["artwork", "shopping", "policies"] } }, required: ["topic"], additionalProperties: false }),
  tool("human_support", "Oferecer encaminhamento para equipe, sem afirmar que um humano está online ou já assumiu. Cliente confirma o encaminhamento."),
];
const productCard = (p: ReturnType<typeof publicCommerceProduct>): AssistantProduct => ({ id: p.id, ...(p.slug ? { slug: p.slug } : {}), name: p.name, description: p.description.slice(0, 600), category: p.category, imageUrl: p.imageUrl, unitCents: p.unitCents, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity, maxArtworks: p.maxArtworks, personalized: p.personalized, artworkBenefit: assistantArtworkBenefit(p) });

export function assistantLines(input: z.infer<typeof assistantProposalSchema>, products: Awaited<ReturnType<typeof commerceProducts>>) {
  return input.items.flatMap(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) throw new CommerceError("Produto não disponível no catálogo desta loja.");
    if (item.artworks > product.maxArtworks || item.artworks > item.quantity || product.personalized === false && item.artworks !== 1) throw new CommerceError("Revise a quantidade de artes deste produto.");
    return distributeQuantity(item.quantity, item.artworks).map((quantity, index) => ({ id: randomUUID(), productId: product.id, quantity, artworkName: item.artworks > 1 ? `${item.artworkName || "Arte"} ${index + 1}` : item.artworkName, artworkId: null, preparation: "customer" as const }));
  });
}
export function assistantCartLines(current: readonly CartLine[], input: z.infer<typeof assistantProposalSchema>, products: Awaited<ReturnType<typeof commerceProducts>>) {
  if (new Set(input.items.map(item => item.productId)).size !== input.items.length) throw new CommerceError("Informe cada produto uma vez, com a quantidade final desejada.");
  const requested = assistantLines(input, products), result = current.map(line => ({ ...line }));
  for (const item of input.items) {
    const existing = current.filter(line => line.productId === item.productId);
    if (!existing.length) { result.push(...requested.filter(line => line.productId === item.productId)); continue; }
    const total = existing.reduce((sum, line) => sum + line.quantity, 0);
    if (existing.length !== item.artworks || existing.length > 1 && total !== item.quantity || existing.length === 1 && item.artworkName && item.artworkName.normalize("NFKC").toLowerCase() !== existing[0].artworkName.normalize("NFKC").toLowerCase())
      throw new CommerceError("Este produto já tem grupos ou artes definidos. Use Alterar itens do orçamento para ajustar esses grupos sem perder suas artes.", 409);
    if (existing.length === 1) result.find(line => line.id === existing[0].id)!.quantity = item.quantity;
  }
  return result;
}
export async function executeAssistantTool(context: AssistantToolContext, name: string, args: unknown, options: { adminPreview?: boolean } = {}): Promise<{ result: object; card: AssistantCard }> {
  const { store, session, config, conversationId } = context;
  if (options.adminPreview) {
    if (!["search_products", "estimate_delivery", "company_information", "store_guide"].includes(name)) throw new CommerceError("O laboratório é somente de consulta; não altera carrinho nem acessa contas.", 403);
  } else await requireAssistantConversation(store.tenant_id, session, conversationId);
  if (name === "search_products") {
    const { query } = z.object({ query: z.string().max(120) }).strict().parse(args);
    const products = await commerceProducts(store.tenant_id);
    const aliases = (await getPool().query("select product_variant_id,alias,normalized_alias,source from product_search_aliases where tenant_id=$1 and active", [store.tenant_id])).rows;
    const candidates = products.map(p => ({ product_id: p.id, product_name: p.name, product_slug: "", product_category: p.category, product_description: p.description, variant_id: p.variantId, variant_name: "", variant_description: null, sku: null, unit_weight_kg: "0", height_cm: null, width_cm: null, length_cm: null, print_width_mm: p.geometry?.widthMm?.toString(), print_height_mm: p.geometry?.heightMm?.toString(), aliases: aliases.filter(a => a.product_variant_id === p.variantId).map(a => ({ alias: a.alias, normalizedAlias: a.normalized_alias, source: a.source })) }));
    const ranked = rankProductCandidates(candidates, query), cards = ranked.slice(0, 6).map(match => productCard(publicCommerceProduct(products.find(p => p.id === match.product_id)!)));
    return { result: { products: cards.map(p => ({ id: p.id, name: p.name, description: p.description, category: p.category, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity, maxArtworks: p.maxArtworks, personalized: p.personalized, artworkBenefit: p.artworkBenefit })), requiresClarification: productSearchRequiresClarification(ranked), hasMore: ranked.length > 6 }, card: { kind: "products", products: cards, clarification: productSearchRequiresClarification(ranked) } };
  }
  if (name === "prepare_quote" || name === "estimate_delivery") {
    if (!config.settings.allowQuotes) throw new CommerceError("Orçamentos por chat não estão habilitados nesta loja.");
    const input = name === "prepare_quote" ? assistantProposalSchema.parse(args) : assistantProposalSchema.extend({ postalCode: z.string().regex(/^\d{8}$/).refine(v => v !== "00000000") }).parse(args);
    const products = await commerceProducts(store.tenant_id), lines = name === "prepare_quote" ? assistantCartLines(session.cart, input, products) : assistantLines(input, products);
    calculateCart(lines, products);
    if (name === "prepare_quote") {
      const combined = lines;
      const calculation = await calculateCommerceCart(store.tenant_id, session.id, combined, products);
      if (combined.length === session.cart.length && combined.every((line, index) => line.id === session.cart[index].id && line.quantity === session.cart[index].quantity))
        return { result: { unchanged: true, itemsAlreadyInDraft: true, valuesInOfficialCard: true }, card: { kind: "cart", items: calculation.items, totalCents: calculation.totalCents } };
      const payload: ProposedAction = { version: 2, revision: session.revision, configRevision: config.revision, lines: combined, pricingHash: hashCommerceToken(JSON.stringify(calculation)) };
      const row = (await getPool().query("insert into commerce_assistant_actions(tenant_id,conversation_id,payload_encrypted) values($1,$2,$3) returning id,expires_at::text", [store.tenant_id, conversationId, encryptTenantSecret(payload)])).rows[0];
      return { result: { proposed: true, desiredFinalQuantities: true, existingCartItems: session.cart.length, items: calculation.items.map(({ name, quantity }) => ({ name, quantity })), needsUserConfirmation: true, pricesInOfficialCard: true }, card: { kind: "proposal", desiredQuantities: true, actionId: row.id, items: calculation.items, totalCents: calculation.totalCents, expiresAt: row.expires_at } };
    }
    const postalCode = "postalCode" in input ? String(input.postalCode) : "";
    const options: StoreShippingOption[] = [], warnings: string[] = [];
    if (store.settings.deliveryEnabled) options.push({ id: "delivery", name: "Entrega local", priceCents: store.settings.deliveryCents, description: store.settings.deliveryDescription, transitDays: store.settings.deliveryTransitDays });
    if (store.settings.pickupEnabled) options.push({ id: "pickup", name: "Retirada na loja", priceCents: 0, description: store.settings.pickupAddress, transitDays: 0 });
    if (store.settings.carrierEnabled) {
      try { const carrier = await publicCarrierDelivery(store.tenant_id, postalCode, lines, products, calculateCart(lines, products).totalCents); if (carrier) options.push(...carrier.options); }
      catch { warnings.push("Não foi possível consultar a transportadora agora. Confirme com a equipe ou tente novamente."); }
    }
    const estimates = sortShippingOptions(options).map(option => ({ ...option, estimate: deliveryEstimate(lines.reduce((sum, line) => sum + line.quantity, 0), option.id === "pickup" ? 0 : option.transitDays ?? null, store.settings.production) }));
    return { result: { optionCount: estimates.length, estimateOnly: true, productionStartsAfterPaymentAndArtworkApproval: true, valuesAndDatesInOfficialCard: true }, card: { kind: "shipping", options: estimates, warnings } };
  }
  if (name === "view_cart") {
    z.object({}).strict().parse(args);
    if (!config.settings.allowQuotes) throw new CommerceError("Orçamentos pelo assistente estão desativados.", 403);
    const products = await commerceProducts(store.tenant_id), calculation = await calculateCommerceCart(store.tenant_id, session.id, session.cart, products);
    return { result: { items: calculation.items.map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity })), needsUserConfirmationInSecureForm: true, valuesInOfficialCard: true }, card: { kind: "cart", items: calculation.items, totalCents: calculation.totalCents } };
  }
  if (name === "continue_quote") {
    z.object({}).strict().parse(args);
    if (!config.settings.allowQuotes) throw new CommerceError("Orçamentos pelo assistente estão desativados.", 403);
    return { result: { hasItems: session.cart.length > 0, officialNavigationAvailable: true, needsEmailVerification: !session.customer_id, needsBillingInformation: true }, card: { kind: "quote_continue" } };
  }
  if (name === "company_information") {
    z.object({}).strict().parse(args);
    return { result: { officialCardAvailable: true, note: "Cliente verá ficha e documentos oficiais. Não reproduza números bancários no texto." }, card: { kind: "company", company: config.settings.company, documents: await assistantDocuments(store.tenant_id) } };
  }
  if (name === "my_orders" || name === "my_quotes") {
    z.object({}).strict().parse(args);
    if (!config.settings.allowOrders) throw new CommerceError("Consultas particulares não estão habilitadas no chat.");
    if (!session.customer_id) return { result: { needsLogin: true }, card: { kind: "login" } };
    if (name === "my_quotes") {
      const quotes = (await listBuyerQuotes(store.tenant_id, session)).slice(0, 5).map(q => ({ id: q.id, totalCents: q.total_cents, createdAt: q.created_at }));
      return { result: { count: quotes.length, detailsInOfficialCards: true }, card: { kind: "quotes", quotes } };
    }
    const rows = (await getPool().query("select id,total_cents,payment_status,fulfillment_status,created_at::text from commerce_orders where tenant_id=$1 and customer_id=$2 and deleted_at is null order by created_at desc limit 5", [store.tenant_id, session.customer_id])).rows;
    return { result: { count: rows.length, detailsInOfficialCards: true }, card: { kind: "orders", orders: rows.map(r => ({ id: r.id, totalCents: r.total_cents, payment: r.payment_status, fulfillment: r.fulfillment_status, createdAt: r.created_at })) } };
  }
  if (name === "store_guide") {
    const { topic } = z.object({ topic: z.enum(["artwork", "shopping", "policies"]) }).strict().parse(args);
    if (topic === "policies") return { result: { officialShortcutsAvailable: true }, card: { kind: "guide", topic } };
    const guide = assistantStoreGuide(store, config.settings, await commerceProducts(store.tenant_id));
    return { result: { officialShortcutsAvailable: true, ...guide, quoteWithoutPurchase: guide.features.quotes, artworkNotRequiredForQuote: guide.features.quotes, benefitRequiresCustomerPreparationAndApproval: true, uploadOnlyEarnsBenefit: false, teamPreparationEarnsBenefit: false }, card: { kind: "guide", topic, guide } };
  }
  if (name === "human_support") {
    z.object({}).strict().parse(args); return { result: { userMustConfirmHandoff: true, liveHumanNotGuaranteed: true }, card: { kind: "handoff", summary: "" } };
  }
  throw new CommerceError("Esta ação não está disponível para o assistente.", 403);
}

export async function confirmAssistantCart(context: AssistantToolContext, actionId: string) {
  const { store, session, config, conversationId } = context;
  if (!config.settings.allowQuotes) throw new CommerceError("Orçamentos por chat estão desativados.", 403);
  return commerceTransaction(async client => {
    await requireAssistantConversation(store.tenant_id, session, conversationId, client);
    const action = (await client.query("select * from commerce_assistant_actions where tenant_id=$1 and conversation_id=$2 and id=$3 for update", [store.tenant_id, conversationId, actionId])).rows[0];
    if (!action) throw new CommerceError("Proposta não encontrada nesta sessão.", 404);
    if (action.applied_at) return { alreadyApplied: true };
    const policy = (await client.query("select allowed from commerce_assistant_limits where tenant_id=$1 for share", [store.tenant_id])).rows[0];
    if (policy?.allowed === false) throw new CommerceError("O assistente foi desativado. Continue pelo carrinho da loja.", 409);
    if (new Date(action.expires_at).getTime() <= Date.now()) throw new CommerceError("Proposta expirada. Solicite outra simulação.", 409);
    const payload = decryptTenantSecret<ProposedAction>(action.payload_encrypted);
    if (payload.version !== 2) throw new CommerceError("Esta proposta foi criada antes da atualização do orçamento. Peça uma nova conferência dos itens antes de confirmar.", 409);
    if (payload.configRevision !== config.revision) throw new CommerceError("As condições da loja mudaram. Solicite outra proposta.", 409);
    const live = (await client.query("select s.enabled,s.revision from commerce_assistant_settings s join commerce_stores c on c.tenant_id=s.tenant_id where s.tenant_id=$1 and c.enabled and c.status='published' for share of s,c", [store.tenant_id])).rows[0];
    if (!live?.enabled || live.revision !== config.revision) throw new CommerceError("O assistente está indisponível. Reabra o atendimento.", 409);
    const current = (await client.query("select id from commerce_sessions where tenant_id=$1 and id=$2 and revision=$3 and expires_at>now() for update", [store.tenant_id, session.id, payload.revision])).rows[0];
    if (!current) throw new CommerceError("O carrinho mudou. Solicite uma nova proposta.", 409);
    if ((await client.query("select id from commerce_orders where tenant_id=$1 and session_id=$2 and cart_revision=$3 and cancelled_at is null and deleted_at is null and payment_status='pending'", [store.tenant_id, session.id, payload.revision])).rows.length)
      throw new CommerceError("Há uma compra aguardando pagamento. Abra o carrinho e escolha Editar itens ou Salvar como orçamento antes de continuar pelo assistente.", 409);
    const products = await commerceProducts(store.tenant_id, client), calculation = await calculateCommerceCart(store.tenant_id, session.id, payload.lines, products, client);
    if (hashCommerceToken(JSON.stringify(calculation)) !== payload.pricingHash) throw new CommerceError("Os preços ou benefícios mudaram. Solicite uma nova simulação.", 409);
    const result = await client.query("update commerce_sessions set cart=$4,revision=revision+1 where tenant_id=$1 and id=$2 and revision=$3 and expires_at>now() returning id", [store.tenant_id, session.id, payload.revision, JSON.stringify(payload.lines)]);
    if (!result.rowCount) throw new CommerceError("O carrinho mudou em outra aba. Solicite outra proposta para preservar seus itens.", 409);
    await client.query("update commerce_assistant_actions set applied_at=now() where tenant_id=$1 and id=$2", [store.tenant_id, actionId]);
    await addAssistantMessage(store.tenant_id, conversationId, "assistant", "Rascunho atualizado. Quer adicionar outro produto, alterar os itens ou continuar?", [{ kind: "cart", items: calculation.items, totalCents: calculation.totalCents }], client);
    await assistantAudit(client, store.tenant_id, null, "cart.confirm", { conversationId, actionId, itemCount: payload.lines.length });
    return { alreadyApplied: false };
  });
}
