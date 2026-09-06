import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { listProductVariants } from "@/repositories/products";
import { listPlatformRules } from "@/repositories/platforms";
import { assertCommerceVideosReady } from "@/repositories/commerce-media";
import type { ProductMedia } from "@/domain/commerce/product-media";
import {
  resolvePrintGeometry,
  resolvePrintMargins,
  type PrintGeometry,
  type PrintMargins,
} from "@/domain/artwork/geometry";
import {
  CommerceError,
  calculateCart,
  type PriceProduct,
} from "@/domain/commerce/commerce";
import type {
  CartLine,
  CheckoutInput,
  StoreAdminInput,
  StoreSettings,
} from "@/domain/commerce/schemas";

export const commerceEnabled = () => process.env.COMMERCE_ENABLED === "true";
export const hashCommerceToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newCommerceToken = () => randomBytes(32).toString("base64url");
export type CommerceProduct = PriceProduct & {
  variantId: string;
  description: string;
  category: string;
  imageUrl: string;
  media?: ProductMedia[];
  personalized: boolean;
  geometry: PrintGeometry | null;
  margins: PrintMargins;
};
export type CommerceStore = {
  tenant_id: string;
  slug: string;
  enabled: boolean;
  status: string;
  revision: number;
  platform_id: string;
  settings: StoreSettings;
};
export type BuyerSession = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  cart: CartLine[];
  revision: number;
};
export type CommerceOrder = {
  id: string;
  tenant_id: string;
  customer_id: string;
  provider: "manual" | "mercado_pago";
  total_cents: number;
  shipping_cents: number;
  subtotal_cents: number;
  payment_status: string;
  fulfillment_status: string;
  checkout_url: string | null;
  provider_payment_id: string | null;
  snapshot: {
    items: ReturnType<typeof calculateCart>["items"];
    lines: CartLine[];
    products: CommerceProduct[];
    address: CheckoutInput["address"];
    delivery: string;
    terms: string;
    customer: { name: string; email: string };
    storeRevision: number;
  };
  created_at: string;
};

export async function commerceTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function getCommerceStore(
  slug: string,
  allowPaused = false,
): Promise<CommerceStore | null> {
  if (!commerceEnabled() || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
    return null;
  const result = await getPool().query<CommerceStore>(
    `select s.*,t.slug from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug=$1 and t.status='active' and s.enabled and (s.status='published' or ($2 and s.status='paused'))`,
    [slug, allowPaused],
  );
  return result.rows[0] ?? null;
}
export async function commercePaymentTenant(
  slug: string,
): Promise<string | null> {
  if (!commerceEnabled() || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
    return null;
  // Existing orders still need reconciliation after the storefront is disabled.
  const result = await getPool().query<{ tenant_id: string }>(
    "select s.tenant_id from commerce_stores s join tenants t on t.id=s.tenant_id where t.slug=$1",
    [slug],
  );
  return result.rows[0]?.tenant_id ?? null;
}
export async function commerceProducts(
  tenantId: string,
  client: Pick<PoolClient, "query"> = getPool(),
): Promise<CommerceProduct[]> {
  const rows = await client.query<{
    id: string;
    snapshot: Omit<CommerceProduct, "id">;
  }>(
    `select cp.id,cp.snapshot from commerce_products cp join product_variants v on v.id=cp.variant_id and v.tenant_id=cp.tenant_id join products p on p.id=v.product_id and p.tenant_id=v.tenant_id where cp.tenant_id=$1 and cp.active and v.active and p.active and v.deleted_at is null and p.deleted_at is null order by cp.snapshot->>'name'`,
    [tenantId],
  );
  return rows.rows.map((row) => ({ ...row.snapshot, id: row.id }));
}
export function publicCommerceProduct(product: CommerceProduct) {
  const {
    id,
    name,
    description,
    category,
    imageUrl,
    minQuantity,
    maxQuantity,
    maxArtworks,
    personalized,
    pricingRule,
    geometry,
    margins,
  } = product;
  const price = calculateCart(
    [
      {
        id: "preview",
        productId: id,
        quantity: minQuantity,
        artworkName: "",
        artworkId: null,
      },
    ],
    [product],
  );
  return {
    id,
    name,
    description,
    category,
    imageUrl,
    ...(product.media ? { media: product.media } : {}),
    minQuantity,
    maxQuantity,
    maxArtworks,
    personalized,
    pricingRule,
    geometry,
    margins,
    unitCents: price.items[0].unitCents,
  };
}
export async function getCommerceAdmin(userId: string, tenantId: string) {
  const [store, products, variants, platforms, payments, orders] =
    await Promise.all([
      getPool().query(
        `select s.*,t.slug from tenants t left join commerce_stores s on s.tenant_id=t.id where t.id=$1`,
        [tenantId],
      ),
      getPool().query(
        `select id,variant_id,active,snapshot from commerce_products where tenant_id=$1 order by snapshot->>'name'`,
        [tenantId],
      ),
      listProductVariants(userId, tenantId),
      listPlatformRules(userId, tenantId),
      getPool().query(
        `select manual_enabled,manual_instructions,mp_enabled,encrypted_credentials is not null as mp_configured from commerce_payment_connections where tenant_id=$1`,
        [tenantId],
      ),
      getPool().query(
        `select id,total_cents,payment_status,fulfillment_status,provider,created_at::text,snapshot->'customer' as customer from commerce_orders where tenant_id=$1 order by created_at desc limit 100`,
        [tenantId],
      ),
    ]);
  return {
    store: store.rows[0],
    products: products.rows,
    variants: variants.map((v) => ({
      id: v.variant_id,
      name: `${v.product_name} - ${v.variant_name}`,
      category: v.product_category,
    })),
    platforms: platforms.map((p) => ({ id: p.id, name: p.name })),
    payments: payments.rows[0] ?? null,
    orders: orders.rows,
  };
}
export async function saveCommerceStore(
  userId: string,
  tenantId: string,
  input: StoreAdminInput,
) {
  await assertCommerceVideosReady(tenantId, input.products);
  const [variants, platforms] = await Promise.all([
    listProductVariants(userId, tenantId),
    listPlatformRules(userId, tenantId),
  ]);
  const platform = platforms.find((p) => p.id === input.platformId);
  if (!platform) throw new CommerceError("Selecione um canal ativo do tenant.");
  if (
    new Set(input.products.map((p) => p.variantId)).size !==
    input.products.length
  )
    throw new CommerceError("Produto duplicado na publicação.");
  if (
    input.status === "published" &&
    (!input.products.some((p) => p.active) ||
      !input.settings.terms ||
      (!input.settings.pickupEnabled && !input.settings.deliveryEnabled))
  )
    throw new CommerceError(
      "Para publicar, inclua produtos, condições de compra e uma opção de entrega.",
    );
  const snapshots = input.products.map((publication) => {
    const variant = variants.find(
      (v) => v.variant_id === publication.variantId,
    );
    if (!variant)
      throw new CommerceError("Produto não disponível neste tenant.");
    const curve = variant.platform_curves?.[platform.id];
    const anchors = curve?.anchors ?? variant.anchors;
    if (!anchors || !Object.keys(anchors).length)
      throw new CommerceError(`Cadastre a curva de ${publication.name}.`);
    const geometry = resolvePrintGeometry(variant);
    if (
      publication.personalized &&
      (!geometry || geometry.widthMm > 150 || geometry.heightMm > 150)
    )
      throw new CommerceError(
        "O piloto suporta artes personalizadas com área de segurança de até 150 mm.",
      );
    return {
      ...publication,
      maxArtworks: publication.personalized ? publication.maxArtworks : 1,
      geometry,
      margins: resolvePrintMargins(variant),
      curve: {
        mode:
          curve?.mode ?? variant.curve_mode ?? platform.default_pricing_mode,
        points: Object.entries(anchors).map(([quantity, unitPrice]) => ({
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
        })),
      },
      platform: {
        commissionRate: Number(platform.commission_rate),
        fixedFee: Number(platform.fixed_fee),
        sellerShippingCost: Number(platform.seller_shipping_cost),
        sellerShippingThreshold: Number(platform.seller_shipping_threshold),
      },
    };
  });
  await commerceTransaction(async (client) => {
    await client.query(
      `insert into commerce_stores(tenant_id,enabled,status,platform_id,settings) values($1,$2,$3,$4,$5) on conflict(tenant_id) do update set enabled=$2,status=$3,platform_id=$4,settings=$5,revision=commerce_stores.revision+1,updated_at=now()`,
      [
        tenantId,
        input.enabled,
        input.status,
        input.platformId,
        JSON.stringify(input.settings),
      ],
    );
    await client.query(
      "update commerce_products set active=false where tenant_id=$1",
      [tenantId],
    );
    for (const snapshot of snapshots)
      await client.query(
        `insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,$3,$4) on conflict(tenant_id,variant_id) do update set active=$3,snapshot=$4,updated_at=now()`,
        [
          tenantId,
          snapshot.variantId,
          snapshot.active,
          JSON.stringify(snapshot),
        ],
      );
    await client.query(
      `insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.store.save','commerce_store',$1,$3)`,
      [
        tenantId,
        userId,
        JSON.stringify({
          enabled: input.enabled,
          status: input.status,
          productCount: snapshots.length,
        }),
      ],
    );
  });
}
export async function findBuyerSession(
  tenantId: string,
  token?: string,
): Promise<BuyerSession | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await getPool().query<BuyerSession>(
    `select id,tenant_id,customer_id,cart,revision from commerce_sessions where tenant_id=$1 and token_hash=$2 and expires_at>now()`,
    [tenantId, hashCommerceToken(token)],
  );
  return result.rows[0] ?? null;
}
export async function createBuyerSession(tenantId: string) {
  const token = newCommerceToken();
  const result = await getPool().query<BuyerSession>(
    `insert into commerce_sessions(tenant_id,token_hash) values($1,$2) returning id,tenant_id,customer_id,cart,revision`,
    [tenantId, hashCommerceToken(token)],
  );
  return { session: result.rows[0], token };
}
export async function cartView(store: CommerceStore, session: BuyerSession) {
  const products = await commerceProducts(store.tenant_id);
  const customer = session.customer_id
    ? (
        await getPool().query(
          `select id,name,email from commerce_customers where tenant_id=$1 and id=$2`,
          [store.tenant_id, session.customer_id],
        )
      ).rows[0]
    : null;
  const payments = (
    await getPool().query(
      `select manual_enabled,mp_enabled,manual_instructions from commerce_payment_connections where tenant_id=$1`,
      [store.tenant_id],
    )
  ).rows[0];
  const artworks = (
    await getPool().query(
      `select id,product_id,file_name,crop,approved_at::text from commerce_artworks where tenant_id=$1 and session_id=$2 order by created_at`,
      [store.tenant_id, session.id],
    )
  ).rows;
  let calculation: ReturnType<typeof calculateCart> | null = null;
  try {
    calculation = calculateCart(session.cart, products);
  } catch {
    /* Keep unavailable lines removable. */
  }
  return {
    lines: session.cart,
    revision: session.revision,
    calculation,
    customer,
    artworks,
    payments: payments ?? {
      manual_enabled: false,
      mp_enabled: false,
      manual_instructions: "",
    },
  };
}
export async function replaceCart(
  store: CommerceStore,
  session: BuyerSession,
  revision: number,
  lines: CartLine[],
) {
  await commerceTransaction(async (client) => {
    const products = await commerceProducts(store.tenant_id, client);
    calculateCart(lines, products);
    for (const line of lines.filter((line) => line.artworkId)) {
      const art = await client.query(
        `select id from commerce_artworks where tenant_id=$1 and session_id=$2 and product_id=$3 and id=$4`,
        [store.tenant_id, session.id, line.productId, line.artworkId],
      );
      if (!art.rowCount)
        throw new CommerceError("A arte não pertence a este carrinho.", 403);
    }
    const result = await client.query(
      `update commerce_sessions set cart=$4,revision=revision+1 where tenant_id=$1 and id=$2 and revision=$3 and expires_at>now() returning id`,
      [store.tenant_id, session.id, revision, JSON.stringify(lines)],
    );
    if (!result.rowCount)
      throw new CommerceError(
        "O carrinho mudou em outra aba. Atualize antes de continuar.",
        409,
      );
  });
}
export async function createCommerceOrder(
  store: CommerceStore,
  session: BuyerSession,
  input: CheckoutInput & { expectedTotalCents: number },
) {
  if (!session.customer_id)
    throw new CommerceError("Entre na sua conta para concluir.", 401);
  return commerceTransaction(async (client) => {
    const locked = await client.query<BuyerSession>(
      `select * from commerce_sessions where tenant_id=$1 and id=$2 and expires_at>now() for update`,
      [store.tenant_id, session.id],
    );
    const current = locked.rows[0];
    if (!current || !current.customer_id)
      throw new CommerceError("Sessão expirada.", 401);
    const previous = await client.query<{ id: string }>(
      "select id from commerce_orders where tenant_id=$1 and session_id=$2 and cart_revision=$3",
      [store.tenant_id, session.id, input.revision],
    );
    if (previous.rows[0]) return previous.rows[0];
    if (current.revision !== input.revision)
      throw new CommerceError(
        "Carrinho alterado. Confira os valores novamente.",
        409,
      );
    const lockedStore = (
      await client.query<CommerceStore>(
        "select * from commerce_stores where tenant_id=$1 for share",
        [store.tenant_id],
      )
    ).rows[0];
    if (!lockedStore.enabled || lockedStore.status !== "published")
      throw new CommerceError("A loja não está recebendo novos pedidos.", 409);
    const settings = lockedStore.settings;
    const products = await commerceProducts(store.tenant_id, client);
    const calculated = calculateCart(current.cart, products);
    if (!current.cart.length || calculated.totalCents <= 0)
      throw new CommerceError("Inclua produtos no carrinho.");
    const shipping = input.delivery === "pickup" ? 0 : settings.deliveryCents;
    if (
      (input.delivery === "pickup" && !settings.pickupEnabled) ||
      (input.delivery === "delivery" &&
        (!settings.deliveryEnabled || !input.address))
    )
      throw new CommerceError("Escolha uma opção de entrega disponível.");
    if (calculated.totalCents + shipping !== input.expectedTotalCents)
      throw new CommerceError(
        "O preço mudou. Atualize o resumo antes de confirmar.",
        409,
      );
    const connections = (
      await client.query(
        "select manual_enabled,mp_enabled from commerce_payment_connections where tenant_id=$1",
        [store.tenant_id],
      )
    ).rows[0];
    if (
      !connections ||
      !(input.provider === "manual"
        ? connections.manual_enabled
        : connections.mp_enabled)
    )
      throw new CommerceError("Meio de pagamento indisponível.");
    for (const line of current.cart) {
      const product = products.find((p) => p.id === line.productId)!;
      if (!product.personalized) continue;
      const approved = await client.query(
        `select id,crop from commerce_artworks where tenant_id=$1 and session_id=$2 and product_id=$3 and id=$4 and approved_at is not null and prepared_path is not null`,
        [store.tenant_id, session.id, line.productId, line.artworkId],
      );
      if (
        !approved.rows[0] ||
        approved.rows[0].crop.geometryHash !== geometryHash(product)
      )
        throw new CommerceError(
          `Enquadre e aprove a arte de ${product.name} antes de concluir.`,
        );
    }
    const customer = (
      await client.query(
        "select name,email from commerce_customers where tenant_id=$1 and id=$2",
        [store.tenant_id, current.customer_id],
      )
    ).rows[0];
    const snapshot = {
      items: calculated.items,
      lines: current.cart,
      products: products.filter((p) =>
        current.cart.some((l) => l.productId === p.id),
      ),
      address: input.address,
      delivery: input.delivery,
      customer,
      terms: settings.terms,
      storeRevision: lockedStore.revision,
    };
    const result = await client.query<{ id: string }>(
      `insert into commerce_orders(tenant_id,customer_id,session_id,cart_revision,snapshot,subtotal_cents,shipping_cents,total_cents,provider) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        store.tenant_id,
        current.customer_id,
        session.id,
        current.revision,
        JSON.stringify(snapshot),
        calculated.totalCents,
        shipping,
        calculated.totalCents + shipping,
        input.provider,
      ],
    );
    await client.query(
      "insert into commerce_order_events(tenant_id,order_id,type) values($1,$2,'order.created')",
      [store.tenant_id, result.rows[0].id],
    );
    await client.query(
      "update commerce_sessions set cart='[]',revision=revision+1 where tenant_id=$1 and id=$2",
      [store.tenant_id, session.id],
    );
    return result.rows[0];
  });
}
export const geometryHash = (product: CommerceProduct) =>
  hashCommerceToken(
    JSON.stringify({ geometry: product.geometry, margins: product.margins }),
  );
export async function buyerOrders(tenantId: string, customerId: string) {
  const result = await getPool().query<CommerceOrder>(
    "select *,created_at::text from commerce_orders where tenant_id=$1 and customer_id=$2 order by commerce_orders.created_at desc limit 100",
    [tenantId, customerId],
  );
  return result.rows.map(
    ({
      id,
      total_cents,
      shipping_cents,
      subtotal_cents,
      payment_status,
      fulfillment_status,
      provider,
      checkout_url,
      created_at,
      snapshot,
    }) => ({
      id,
      total_cents,
      shipping_cents,
      subtotal_cents,
      payment_status,
      fulfillment_status,
      provider,
      checkout_url,
      created_at,
      items: snapshot.items,
      address: snapshot.address,
      delivery: snapshot.delivery,
    }),
  );
}
