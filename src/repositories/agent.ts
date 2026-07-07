import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  calculateCompositeQuote,
  type CompositePricingRule,
  type CompositeQuoteInputItem
} from "@/domain/quotes/composite-pricing";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { getPool, query, withTenantContext } from "@/lib/db/client";

export type AgentContext = {
  apiKeyId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  actorUserId: string;
  scopes: string[];
  keyName: string;
};

export type AgentProduct = {
  product_id: string;
  product_name: string;
  product_slug: string;
  product_category: string;
  product_description: string | null;
  variant_id: string;
  variant_name: string;
  variant_description: string | null;
  sku: string | null;
  unit_weight_kg: string;
  height_cm: string | null;
  width_cm: string | null;
  length_cm: string | null;
};

export type AgentPlatform = {
  id: string;
  key: string;
  name: string;
};

export type AgentQuoteItemInput = {
  productVariantId: string;
  quantity: number;
  artworkName?: string | null;
};

export type AgentApiKeyView = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
};

type AgentKeyRow = {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  name: string;
  key_hash: string;
  scopes: string[];
  actor_user_id: string | null;
};

export function generateAgentApiKey() {
  const prefix = randomBytes(5).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const token = `pp_agent_live_${prefix}_${secret}`;
  return {
    token,
    prefix,
    hash: hashAgentToken(token)
  };
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function listAgentApiKeys(userId: string, tenantId: string): Promise<AgentApiKeyView[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<AgentApiKeyView>(
      `
        select
          k.id,
          k.name,
          k.key_prefix,
          k.scopes,
          k.status,
          k.last_used_at,
          k.created_at,
          k.revoked_at,
          u.name as created_by_name,
          u.email::text as created_by_email
        from agent_api_keys k
        left join app_users u on u.id = k.created_by
        where k.tenant_id = $1
        order by
          case k.status when 'active' then 0 else 1 end,
          k.created_at desc
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function createAgentApiKey(userId: string, tenantId: string, input: { name: string; scopes: string[] }) {
  const generated = generateAgentApiKey();
  const key = await withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<AgentApiKeyView>(
      `
        insert into agent_api_keys (
          tenant_id,
          name,
          key_prefix,
          key_hash,
          scopes,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          name,
          key_prefix,
          scopes,
          status,
          last_used_at,
          created_at,
          revoked_at,
          null::text as created_by_name,
          null::text as created_by_email
      `,
      [tenantId, input.name, generated.prefix, generated.hash, input.scopes, userId]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'agent_api_key.created', 'agent_api_key', $3, $4)
      `,
      [
        tenantId,
        userId,
        result.rows[0].id,
        JSON.stringify({ name: input.name, keyPrefix: generated.prefix, scopes: input.scopes })
      ]
    );

    return result.rows[0];
  });

  return { key, token: generated.token };
}

export async function revokeAgentApiKey(userId: string, tenantId: string, keyId: string): Promise<AgentApiKeyView | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<AgentApiKeyView>(
      `
        update agent_api_keys
        set status = 'revoked',
            revoked_at = coalesce(revoked_at, now())
        where tenant_id = $1
          and id = $2
        returning
          id,
          name,
          key_prefix,
          scopes,
          status,
          last_used_at,
          created_at,
          revoked_at,
          null::text as created_by_name,
          null::text as created_by_email
      `,
      [tenantId, keyId]
    );

    if (!result.rows[0]) return null;

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'agent_api_key.revoked', 'agent_api_key', $3, $4)
      `,
      [tenantId, userId, keyId, JSON.stringify({ keyPrefix: result.rows[0].key_prefix, name: result.rows[0].name })]
    );

    return result.rows[0];
  });
}

export async function authenticateAgentApiKey(token: string): Promise<AgentContext | null> {
  const prefix = extractPrefix(token);
  if (!prefix) return null;

  const rows = await query<AgentKeyRow>(
    `
      select
        k.id,
        k.tenant_id,
        t.slug as tenant_slug,
        t.name as tenant_name,
        k.name,
        k.key_hash,
        k.scopes,
        coalesce(k.created_by, owner.user_id) as actor_user_id
      from agent_api_keys k
      join tenants t on t.id = k.tenant_id
      left join lateral (
        select tm.user_id
        from tenant_members tm
        join roles r on r.id = tm.role_id and r.key = 'owner'
        where tm.tenant_id = k.tenant_id
          and tm.status = 'active'
        order by tm.created_at asc
        limit 1
      ) owner on true
      where k.key_prefix = $1
        and k.status = 'active'
        and t.status = 'active'
      limit 5
    `,
    [prefix]
  );

  const tokenHash = hashAgentToken(token);
  const match = rows.find((row) => safeEqual(row.key_hash, tokenHash));
  if (!match || !match.actor_user_id) return null;

  await getPool().query("update agent_api_keys set last_used_at = now() where id = $1", [match.id]);

  return {
    apiKeyId: match.id,
    tenantId: match.tenant_id,
    tenantSlug: match.tenant_slug,
    tenantName: match.tenant_name,
    actorUserId: match.actor_user_id,
    scopes: match.scopes ?? [],
    keyName: match.name
  };
}

export function hasAgentScope(context: AgentContext, scope: string) {
  return context.scopes.includes(scope) || context.scopes.includes("*");
}

export async function searchAgentProducts(
  context: AgentContext,
  term: string,
  limit = 10
): Promise<AgentProduct[]> {
  return withTenantContext(context.actorUserId, context.tenantId, async (client) => {
    const normalized = `%${term.trim().replace(/\s+/g, "%")}%`;
    const result = await client.query<AgentProduct>(
      `
        select
          p.id as product_id,
          p.name as product_name,
          p.slug as product_slug,
          p.category as product_category,
          p.description as product_description,
          v.id as variant_id,
          v.name as variant_name,
          v.description as variant_description,
          v.sku,
          v.unit_weight_kg,
          v.height_cm,
          v.width_cm,
          v.length_cm
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.active = true
          and v.active = true
          and (
            $2 = ''
            or lower(coalesce(v.sku, '')) = lower($2)
            or lower(p.name) like lower($3)
            or lower(v.name) like lower($3)
            or lower(coalesce(p.description, '')) like lower($3)
            or lower(coalesce(v.description, '')) like lower($3)
            or lower(p.category) like lower($3)
          )
        order by
          case when lower(coalesce(v.sku, '')) = lower($2) then 0 else 1 end,
          p.name,
          v.name
        limit $4
      `,
      [context.tenantId, term.trim(), normalized, limit]
    );

    return result.rows;
  });
}

export async function resolveAgentVariant(context: AgentContext, input: {
  productSku?: string | null;
  productVariantId?: string | null;
  productName?: string | null;
}): Promise<AgentProduct> {
  return withTenantContext(context.actorUserId, context.tenantId, async (client) => {
    const result = await client.query<AgentProduct>(
      `
        select
          p.id as product_id,
          p.name as product_name,
          p.slug as product_slug,
          p.category as product_category,
          p.description as product_description,
          v.id as variant_id,
          v.name as variant_name,
          v.description as variant_description,
          v.sku,
          v.unit_weight_kg,
          v.height_cm,
          v.width_cm,
          v.length_cm
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and p.active = true
          and v.active = true
          and (
            ($2::uuid is not null and v.id = $2::uuid)
            or ($3::text is not null and lower(v.sku) = lower($3::text))
            or ($4::text is not null and (lower(p.name) like lower($4::text) or lower(v.name) like lower($4::text)))
          )
        order by
          case when $2::uuid is not null and v.id = $2::uuid then 0 else 1 end,
          case when $3::text is not null and lower(v.sku) = lower($3::text) then 0 else 1 end,
          p.name,
          v.name
        limit 2
      `,
      [
        context.tenantId,
        input.productVariantId ?? null,
        clean(input.productSku),
        input.productName ? `%${input.productName.trim().replace(/\s+/g, "%")}%` : null
      ]
    );

    if (result.rows.length === 0) throw new AgentApiError("product_not_found", "Produto não encontrado.", 404);
    if (result.rows.length > 1 && !input.productVariantId && !input.productSku) {
      throw new AgentApiError("ambiguous_product", "Mais de um produto corresponde à busca.", 409);
    }
    return result.rows[0];
  });
}

export async function resolveAgentPlatform(context: AgentContext, platformSlug?: string | null): Promise<AgentPlatform> {
  return withTenantContext(context.actorUserId, context.tenantId, async (client) => {
    const result = await client.query<AgentPlatform>(
      `
        select id, key, name
        from platform_rules
        where tenant_id = $1
          and active = true
        order by
          sort_order asc,
          name asc
      `,
      [context.tenantId]
    );
    const platforms = result.rows;
    if (!platforms[0]) throw new AgentApiError("platform_not_found", "Nenhum canal/plataforma ativo foi encontrado.", 404);

    const requested = clean(platformSlug);
    if (!requested) return platforms[0];

    const aliases = platformLookupAliases(requested);
    const match = platforms.find((platform) => {
      const key = normalizePlatformLookup(platform.key);
      const name = normalizePlatformLookup(platform.name);
      return aliases.includes(key) || aliases.includes(name);
    });
    if (match) return match;

    const available = platforms.map((platform) => `${platform.key} (${platform.name})`).join(", ");
    throw new AgentApiError(
      "platform_not_found",
      `Canal/plataforma "${requested}" não encontrado. Canais ativos disponíveis: ${available}. Se não tiver certeza, omita platformSlug para usar o canal padrão.`,
      404
    );
  });
}

export async function calculateAgentCompositeQuote(context: AgentContext, input: {
  platformRuleId: string;
  pricingRule?: CompositePricingRule;
  items: AgentQuoteItemInput[];
  shippingTotal?: number;
}) {
  return withTenantContext(context.actorUserId, context.tenantId, async (client) => {
    const platformResult = await client.query<{
      id: string;
      key: string;
      name: string;
      commission_rate: string;
      fixed_fee: string;
      seller_shipping_cost: string;
      seller_shipping_threshold: string;
    }>(
      `
        select id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold
        from platform_rules
        where tenant_id = $1 and id = $2 and active = true
        limit 1
      `,
      [context.tenantId, input.platformRuleId]
    );
    const platform = platformResult.rows[0];
    if (!platform) throw new AgentApiError("platform_not_found", "Canal/plataforma não encontrado.", 404);

    const variantIds = Array.from(new Set(input.items.map((item) => item.productVariantId)));
    const variantResult = await client.query<{
      variant_id: string;
      variant_name: string;
      product_name: string;
      unit_cost: string;
      curve_mode: PricingCurveMode | null;
      anchors: Record<string, string> | null;
    }>(
      `
        select
          v.id as variant_id,
          v.name as variant_name,
          p.name as product_name,
          v.unit_cost,
          pc.mode as curve_mode,
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_anchors pa
            where pa.pricing_curve_id = pc.id
              and pa.tenant_id = pc.tenant_id
          ) as anchors
        from product_variants v
        join products p on p.id = v.product_id and p.tenant_id = v.tenant_id
        left join lateral (
          select pc.*
          from pricing_curves pc
          where pc.product_variant_id = v.id
            and pc.tenant_id = v.tenant_id
            and pc.active = true
            and (pc.platform_rule_id = $3 or pc.platform_rule_id is null)
          order by case when pc.platform_rule_id = $3 then 0 else 1 end, pc.version desc, pc.created_at desc
          limit 1
        ) pc on true
        where v.tenant_id = $1
          and v.id = any($2::uuid[])
          and v.active = true
          and p.active = true
      `,
      [context.tenantId, variantIds, input.platformRuleId]
    );
    const variants = new Map(variantResult.rows.map((variant) => [variant.variant_id, variant]));
    if (variants.size !== variantIds.length) {
      throw new AgentApiError("product_not_found", "Um ou mais produtos não foram encontrados.", 404);
    }

    const calculationItems: CompositeQuoteInputItem[] = input.items.map((item, index) => {
      const variant = variants.get(item.productVariantId);
      if (!variant) throw new AgentApiError("product_not_found", "Produto não encontrado.", 404);
      if (!variant.anchors) throw new AgentApiError("pricing_curve_not_found", "Produto sem curva de preço ativa.", 409);
      return {
        id: String(index + 1),
        productVariantId: item.productVariantId,
        description: `${variant.product_name} - ${variant.variant_name}`,
        artworkName: item.artworkName?.trim() || `Arte ${index + 1}`,
        quantity: item.quantity,
        unitCost: Number(variant.unit_cost),
        curve: mapAgentCurve(variant.curve_mode, variant.anchors)
      };
    });

    const calculation = calculateCompositeQuote({
      items: calculationItems,
      platform: {
        commissionRate: Number(platform.commission_rate),
        fixedFee: Number(platform.fixed_fee),
        sellerShippingCost: Number(platform.seller_shipping_cost),
        sellerShippingThreshold: Number(platform.seller_shipping_threshold)
      },
      pricingRule: input.pricingRule ?? "per_item"
    });
    const shippingTotal = Math.max(0, input.shippingTotal ?? 0);

    return {
      platform: { id: platform.id, key: platform.key, name: platform.name },
      calculation,
      totals: {
        subtotal: calculation.subtotal,
        shipping: shippingTotal,
        discount: 0,
        grandTotal: calculation.subtotal + shippingTotal
      }
    };
  });
}

export async function logAgentAudit(
  context: AgentContext,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await getPool().query(
    `
      insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, $3, 'agent_api_key', $4, $5)
    `,
    [
      context.tenantId,
      context.actorUserId,
      action,
      context.apiKeyId,
      JSON.stringify({ source: "agent_api", apiKeyId: context.apiKeyId, keyName: context.keyName, ...metadata })
    ]
  );
}

export async function findIdempotencyResponse(context: AgentContext, key: string, requestHash: string) {
  const rows = await query<{ request_hash: string; response_body: unknown; status_code: number | null }>(
    `
      select request_hash, response_body, status_code
      from agent_idempotency_keys
      where tenant_id = $1 and idempotency_key = $2
      limit 1
    `,
    [context.tenantId, key]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw new AgentApiError("idempotency_conflict", "A mesma chave de idempotência foi usada com outro payload.", 409);
  }
  return { body: row.response_body, status: row.status_code ?? 200 };
}

export async function saveIdempotencyResponse(
  context: AgentContext,
  key: string,
  requestHash: string,
  responseBody: unknown,
  statusCode: number
) {
  await getPool().query(
    `
      insert into agent_idempotency_keys (
        tenant_id,
        api_key_id,
        idempotency_key,
        request_hash,
        response_body,
        status_code
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (tenant_id, idempotency_key) do nothing
    `,
    [context.tenantId, context.apiKeyId, key, requestHash, JSON.stringify(responseBody), statusCode]
  );
}

export function hashRequestBody(body: unknown) {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

export class AgentApiError extends Error {
  code: string;
  status: number;
  field?: string;
  recoverable: boolean;

  constructor(code: string, message: string, status = 400, options?: { field?: string; recoverable?: boolean }) {
    super(message);
    this.name = "AgentApiError";
    this.code = code;
    this.status = status;
    this.field = options?.field;
    this.recoverable = options?.recoverable ?? status < 500;
  }
}

function extractPrefix(token: string) {
  const match = token.match(/^pp_agent_live_([a-f0-9]{10})_/);
  return match?.[1] ?? null;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clean(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function platformLookupAliases(value: string) {
  const normalized = normalizePlatformLookup(value);
  const aliases = new Set([normalized]);

  if (["whatsapp", "whats", "zap", "wpp", "vendaonline", "vendawhatsapp"].includes(normalized)) {
    aliases.add("direct");
    aliases.add("vendadireta");
  }

  if (["direct", "direto", "vendadireta"].includes(normalized)) {
    aliases.add("direct");
    aliases.add("vendadireta");
  }

  if (["mercadolivreclassico", "mercadolivreclassic", "mlclassico", "mlclassic"].includes(normalized)) {
    aliases.add("mlclassic");
    aliases.add("mlclassico");
  }

  if (["mercadolivrepremium", "mlpremium"].includes(normalized)) {
    aliases.add("mlpremium");
  }

  if (["shopee", "shopeepadrao", "shopeestandard"].includes(normalized)) {
    aliases.add("shopeestandard");
    aliases.add("shopeepadrao");
  }

  return Array.from(aliases);
}

function normalizePlatformLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapAgentCurve(mode: PricingCurveMode | null, anchors: Record<string, string>): PricingCurve {
  return {
    mode: mode ?? "interpolated",
    points: Object.entries(anchors)
      .map(([quantity, unitPrice]) => ({
        quantity: Number(quantity),
        unitPrice: Number(unitPrice)
      }))
      .sort((a, b) => a.quantity - b.quantity)
  };
}
