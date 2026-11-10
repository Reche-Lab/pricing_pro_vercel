// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getPool } from "@/lib/db/client";
import { getCurrentSession } from "@/lib/auth/session";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  libraryQuerySchema,
  type LibraryArtwork,
} from "@/domain/commerce/library";
import {
  mutateCommerceLibrary,
  readCommerceLibrary,
  librarySource,
} from "@/repositories/commerce-library";
import {
  uploadLibraryArtwork,
  selectLibraryArtwork,
  previewLibrarySelection,
} from "@/services/commerce/library";
import {
  commerceProducts,
  getCommerceStore,
  createBuyerSession,
  cartView,
  findBuyerSession,
  replaceCart,
  createCommerceOrder,
  calculateCommerceCart,
  type CommerceProduct,
} from "@/repositories/commerce";
import {
  libraryListing,
  librarySelection,
  libraryThumbnail,
} from "@/services/commerce/library-http";
import { GET as adminRead } from "@/app/api/commerce/admin/library/route";
import { GET as adminAsset } from "@/app/api/commerce/admin/library/assets/[artworkId]/route";
import { POST as prepareArt } from "@/app/api/store/[slug]/artworks/[artworkId]/route";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
const memory = vi.hoisted(() => ({
  files: new Map<string, { bytes: Uint8Array; contentType: string }>(),
  cookies: new Map<string, string>(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      memory.cookies.has(name)
        ? { value: memory.cookies.get(name) }
        : undefined,
    set: (name: string, value: string) => memory.cookies.set(name, value),
  }),
}));
vi.mock("@/services/storage/artwork-storage", async (original) => ({
  ...(await original<typeof import("@/services/storage/artwork-storage")>()),
  uploadArtworkObject: vi.fn(
    async (input: { path: string; bytes: Uint8Array; contentType: string }) => {
      memory.files.set(input.path, input);
      return input.path;
    },
  ),
  downloadArtworkObject: vi.fn(
    async (path: string) => memory.files.get(path) ?? null,
  ),
  deleteArtworkObject: vi.fn(async (path: string | null) => {
    if (path) memory.files.delete(path);
  }),
}));
const url = process.env.COMMERCE_TEST_DATABASE_URL;
describe.skipIf(!url)("campaign library isolated Postgres and storage", () => {
  let tenant: string,
    other: string,
    actor: string,
    slug: string,
    product: CommerceProduct,
    artId: string,
    rootId: string,
    campaignId: string;
  const query = (input: Record<string, unknown> = {}) =>
    libraryQuerySchema.parse(input);
  const request = (
    path: string,
    body?: unknown,
    origin = "http://localhost:3011",
  ) =>
    new Request(`http://localhost:3011${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const command = (input: Parameters<typeof mutateCommerceLibrary>[2]) =>
    mutateCommerceLibrary(tenant, actor, input);
  const admin = () => readCommerceLibrary(tenant, query(), "admin");
  async function saveArt(overrides: Partial<LibraryArtwork> = {}) {
    const art = (
      await readCommerceLibrary(tenant, query({ artwork: artId }), "admin")
    ).artworks[0];
    const changed = { ...art, ...overrides };
    return command({
      action: "artwork.save",
      id: art.id,
      revision: art.revision,
      title: changed.title,
      description: changed.description,
      tags: changed.tags,
      categoryId: changed.category_id,
      campaignIds: changed.campaign_ids,
      productIds: changed.product_ids,
      status: changed.status as "draft" | "published" | "archived",
      editable: changed.editable,
      licenseNote: changed.license_note!,
    });
  }
  beforeAll(async () => {
    if (
      !url ||
      !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
      !new URL(url).pathname.startsWith("/commerce_test_")
    )
      throw new Error("Use an isolated local commerce_test_ database.");
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = "false";
    process.env.COMMERCE_ENABLED = "true";
    process.env.APP_URL = "http://localhost:3011";
    const pool = getPool();
    slug = `library-${randomUUID().slice(0, 8)}`;
    tenant = (
      await pool.query(
        "insert into tenants(name,slug) values('Loja biblioteca',$1) returning id",
        [slug],
      )
    ).rows[0].id;
    other = (
      await pool.query(
        "insert into tenants(name,slug) values('Outra biblioteca',$1) returning id",
        [`other-${slug}`],
      )
    ).rows[0].id;
    actor = (
      await pool.query(
        "insert into app_users(email,name,password_hash,status) values($1,'Admin biblioteca','not-a-password','active') returning id",
        [`${slug}@example.test`],
      )
    ).rows[0].id;
    await pool.query(
      "insert into tenant_members(tenant_id,user_id,role_id,status) select $1,$2,id,'active' from roles where key='owner'",
      [tenant, actor],
    );
    const family = (
      await pool.query(
        "insert into products(tenant_id,name,slug,category) values($1,'Botton','botton','Personalizados') returning id",
        [tenant],
      )
    ).rows[0].id;
    const variant = (
      await pool.query(
        "insert into product_variants(tenant_id,product_id,name) values($1,$2,'35 mm') returning id",
        [tenant, family],
      )
    ).rows[0].id;
    await pool.query(
      "insert into commerce_stores(tenant_id,enabled,status,settings) values($1,true,'published',$2),($3,false,'draft','{}')",
      [
        tenant,
        JSON.stringify({
          name: "Loja biblioteca",
          pickupEnabled: true,
          pickupAddress: "Rua de teste",
          terms: "Condições do teste de biblioteca.",
        }),
        other,
      ],
    );
    const snapshot: Omit<CommerceProduct, "id"> = {
      variantId: variant,
      name: "Botton 35 mm",
      description: "Produto de teste",
      category: "Bottons",
      imageUrl: "",
      minQuantity: 1,
      maxQuantity: 1000,
      maxArtworks: 10,
      personalized: true,
      pricingRule: "per_art",
      geometry: {
        shape: "circle",
        widthMm: 35,
        heightMm: 35,
        cornerStyle: "sharp",
        cornerRadiusMm: 0,
        rotationDegrees: 0,
        allowPrintRotation: false,
      },
      margins: { bleedMm: 2, safeMarginMm: 2 },
      curve: {
        mode: "step",
        points: [
          { quantity: 1, unitPrice: 5 },
          { quantity: 10, unitPrice: 3 },
        ],
      },
      platform: {
        commissionRate: 0,
        fixedFee: 0,
        sellerShippingCost: 0,
        sellerShippingThreshold: 0,
      },
    };
    await pool.query(
      "insert into commerce_products(tenant_id,variant_id,active,snapshot) values($1,$2,true,$3)",
      [tenant, variant, JSON.stringify(snapshot)],
    );
    await pool.query(
      "insert into commerce_payment_connections(tenant_id,manual_enabled) values($1,true)",
      [tenant],
    );
    product = (await commerceProducts(tenant))[0];
  });
  afterAll(async () => {
    await getPool().end();
    globalThis.__pricingPool = undefined;
  });
  it("starts disabled and creates an idempotent draft taxonomy without publishing content", async () => {
    await expect(readCommerceLibrary(tenant, query())).rejects.toThrow(
      "indisponível",
    );
    await command({ action: "starter" });
    await command({ action: "starter" });
    const result = await admin();
    expect(result.enabled).toBe(false);
    expect(result.categories).toHaveLength(4);
    expect(result.campaigns).toHaveLength(4);
    expect(result.campaigns.every((c) => c.status === "draft")).toBe(true);
    rootId = result.categories.find((c) => c.slug === "saude")!.id;
    campaignId = result.campaigns.find((c) => c.slug === "outubro-rosa")!.id;
    await command({ action: "settings", enabled: true });
  });
  it("validates actual uploads, stores originals privately and starts images as drafts", async () => {
    const bytes = await sharp({
      create: { width: 900, height: 700, channels: 3, background: "#e84888" },
    })
      .png()
      .toBuffer();
    artId = (
      await uploadLibraryArtwork(tenant, actor, {
        fileName: "Flores.png",
        mimeType: "image/png",
        fileSize: bytes.length,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        categoryId: rootId,
        campaignIds: [campaignId],
        productIds: [product.id],
        licenseNote: "Arte original criada para testes",
        rightsConfirmed: true,
      })
    ).id;
    expect((await admin()).artworks).toHaveLength(1);
    expect((await readCommerceLibrary(tenant, query())).total).toBe(0);
    expect((await readCommerceLibrary(tenant, query(), "preview")).total).toBe(
      1,
    );
    const original = await librarySource(tenant, artId, "admin");
    expect(original.storage_path).toContain(`${tenant}/commerce/library/`);
    expect(memory.files.has(original.thumbnail_path)).toBe(true);
    const before = memory.files.size;
    await expect(
      uploadLibraryArtwork(tenant, actor, {
        fileName: "fake.png",
        mimeType: "image/png",
        fileSize: 4,
        dataUrl: "data:image/png;base64,dGVzdA==",
        categoryId: null,
        campaignIds: [],
        productIds: [],
        licenseNote: "Teste autorizado",
        rightsConfirmed: true,
      }),
    ).rejects.toBeInstanceOf(CommerceError);
    expect(memory.files.size).toBe(before);
  });
  it("rejects cross-tenant links in SQL and cleans up files after a rejected upload", async () => {
    await expect(
      getPool().query(
        "insert into commerce_library_products(tenant_id,artwork_id,product_id) values($1,$2,$3)",
        [other, artId, product.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(librarySource(other, artId, "admin")).rejects.toThrow();
    const size = memory.files.size,
      bytes = await sharp({
        create: { width: 30, height: 30, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
    await expect(
      uploadLibraryArtwork(tenant, actor, {
        fileName: "invalid-link.png",
        mimeType: "image/png",
        fileSize: bytes.length,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        categoryId: null,
        campaignIds: [],
        productIds: [randomUUID()],
        licenseNote: "Arte original de teste",
        rightsConfirmed: true,
      }),
    ).rejects.toThrow();
    expect(memory.files.size).toBe(size);
  });
  it("publishes compatible artwork, searches categories/campaigns and withholds private metadata", async () => {
    await saveArt({ status: "published", tags: ["prevenção"] });
    expect(
      (await readCommerceLibrary(tenant, query({ q: "PREVENÇÃO" }))).total,
    ).toBe(1);
    expect(
      (await readCommerceLibrary(tenant, query({ q: "saúde" }))).total,
    ).toBe(1);
    expect(
      (await readCommerceLibrary(tenant, query({ q: "outubro" }))).total,
    ).toBe(0);
    const campaign = (await admin()).campaigns.find(
      (c) => c.id === campaignId,
    )!;
    await command({
      action: "campaign.save",
      id: campaign.id,
      revision: campaign.revision,
      name: campaign.name,
      slug: campaign.slug,
      description: "Uma coleção para conscientização",
      coverUrl: "https://example.test/cover.webp",
      status: "published",
      featured: true,
      startsAt: null,
      endsAt: null,
    });
    const result = await readCommerceLibrary(tenant, query({ q: "outubro" }));
    expect(result.total).toBe(1);
    expect(result.campaigns).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("storage_path");
    expect(result.artworks[0]).not.toHaveProperty("license_note");
    expect(result.artworks[0]).not.toHaveProperty("bindings");
  });
  it("hides expired collections, hidden category trees and unavailable products in SQL", async () => {
    const parent = (await admin()).categories.find(
      (c) => c.id === rootId,
    )!.parent_id;
    try {
      await getPool().query(
        "update commerce_art_campaigns set ends_at=now()-interval '1 second' where id=$1",
        [campaignId],
      );
      expect(
        (await readCommerceLibrary(tenant, query())).campaigns,
      ).toHaveLength(0);
      expect(
        (await readCommerceLibrary(tenant, query({ campaign: "outubro-rosa" })))
          .total,
      ).toBe(0);
      expect((await readCommerceLibrary(tenant, query())).total).toBe(1);
      await getPool().query(
        "update commerce_art_categories set active=false where id=$1",
        [parent],
      );
      expect((await readCommerceLibrary(tenant, query())).total).toBe(0);
      expect(
        (await readCommerceLibrary(tenant, query(), "preview")).total,
      ).toBe(1);
      await getPool().query(
        "update commerce_art_categories set active=true where id=$1",
        [parent],
      );
      await getPool().query(
        "update commerce_products set active=false where id=$1",
        [product.id],
      );
      expect((await readCommerceLibrary(tenant, query())).total).toBe(0);
      await expect(librarySource(tenant, artId, "public")).rejects.toThrow();
      await saveArt({ status: "archived" });
      expect((await admin()).artworks[0].status).toBe("archived");
    } finally {
      await getPool().query(
        "update commerce_art_categories set active=true where id=$1",
        [parent],
      );
      await getPool().query(
        "update commerce_products set active=true where id=$1",
        [product.id],
      );
      await getPool().query(
        "update commerce_art_campaigns set ends_at=null where id=$1",
        [campaignId],
      );
      await saveArt({ status: "published" });
    }
  });
  it("denies direct browser-role access to library tables", async () => {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      await expect(
        client.query("select * from commerce_library_artworks"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("enforces optimistic revisions, hierarchy and complete reorder lists", async () => {
    const current = (await admin()).categories.find((c) => c.id === rootId)!;
    await expect(
      command({
        action: "category.save",
        id: current.id,
        revision: current.revision,
        name: current.name,
        slug: current.slug,
        parentId: current.id,
        active: true,
      }),
    ).rejects.toThrow();
    await expect(
      command({ action: "reorder", kind: "category", ids: [rootId] }),
    ).rejects.toThrow("lista mudou");
    const art = (await admin()).artworks[0];
    await command({
      action: "binding.save",
      artworkId: artId,
      productId: product.id,
      revision: art.revision,
      crop: { scale: 0.8, offsetX: 0.1, offsetY: -0.1, rotationDegrees: 0 },
    });
    await expect(
      command({
        action: "binding.save",
        artworkId: artId,
        productId: product.id,
        revision: art.revision,
        crop: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 },
      }),
    ).rejects.toThrow("mudou");
  });
  it("copies an independent, unapproved file per customer and carries initial framing", async () => {
    const { session } = await createBuyerSession(tenant);
    const result = await selectLibraryArtwork(
      tenant,
      session,
      artId,
      product.id,
    );
    const source = await librarySource(tenant, artId, "admin");
    const copied = (
      await getPool().query("select * from commerce_artworks where id=$1", [
        result.artwork.id,
      ])
    ).rows[0];
    expect(copied.storage_path).not.toBe(source.storage_path);
    expect(memory.files.has(copied.storage_path)).toBe(true);
    expect(copied.library_version).toBe(source.version);
    expect(copied.approved_at).toBeNull();
    expect(copied.crop).toBeNull();
    expect(copied.prepared_path).toBeNull();
    expect(copied.initial_crop.scale).toBe(0.8);
    expect(
      (await cartView((await getCommerceStore(slug))!, session)).artworks[0]
        .initial_crop.scale,
    ).toBe(0.8);
    const before = (
      await getPool().query(
        "select count(*)::int total from commerce_artworks where tenant_id=$1",
        [tenant],
      )
    ).rows[0].total;
    expect(
      (await previewLibrarySelection(tenant, artId, product.id)).dataUrl,
    ).toMatch(/^data:image\/webp;base64,/);
    expect(
      (
        await getPool().query(
          "select count(*)::int total from commerce_artworks where tenant_id=$1",
          [tenant],
        )
      ).rows[0].total,
    ).toBe(before);
    const fileCount = memory.files.size;
    await expect(
      selectLibraryArtwork(
        tenant,
        { ...session, id: randomUUID() },
        artId,
        product.id,
      ),
    ).rejects.toThrow("expirada");
    expect(memory.files.size).toBe(fileCount);
  });
  it("guards admin APIs, private preview, origins and query inputs", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect(
      (await adminRead(request("/api/commerce/admin/library"))).status,
    ).toBe(401);
    expect(
      (
        await adminAsset(request("/api/commerce/admin/library/assets/x"), {
          params: Promise.resolve({ artworkId: artId }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await libraryListing(
          request(`/api/commerce/${slug}/preview/library`),
          slug,
          true,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await libraryListing(
          request(`/api/store/${slug}/library?tenantId=${other}`),
          slug,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await librarySelection(
          request(
            `/api/store/${slug}/library/select`,
            { artworkId: artId, productId: product.id },
            "https://malicious.test",
          ),
          slug,
        )
      ).status,
    ).toBe(403);
    vi.mocked(getCurrentSession).mockResolvedValue({
      userId: actor,
      tenantId: tenant,
      role: "owner",
      email: `${slug}@example.test`,
    });
    expect(
      (await adminRead(request("/api/commerce/admin/library"))).status,
    ).toBe(200);
    expect(
      (
        await libraryListing(
          request(`/api/commerce/other-${slug}/preview/library`),
          `other-${slug}`,
          true,
        )
      ).status,
    ).toBe(404);
    const thumbnail = await libraryThumbnail(
      request(`/api/store/${slug}/library/thumbnail/${artId}`),
      slug,
      artId,
    );
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
  });
  it("uses the existing prepare, explicit approval, checkout and production proof flow", async () => {
    const selected = await librarySelection(
      request(`/api/store/${slug}/library/select`, {
        artworkId: artId,
        productId: product.id,
      }),
      slug,
    );
    expect(selected.status).toBe(201);
    const { artwork } = await selected.json();
    const context = {
      params: Promise.resolve({ slug, artworkId: artwork.id }),
    };
    expect(
      (
        await prepareArt(
          request(`/api/store/${slug}/artworks/${artwork.id}`, {
            action: "approve",
          }),
          context,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await prepareArt(
          request(`/api/store/${slug}/artworks/${artwork.id}`, {
            action: "prepare",
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotationDegrees: 0,
          }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await prepareArt(
          request(`/api/store/${slug}/artworks/${artwork.id}`, {
            action: "approve",
          }),
          context,
        )
      ).status,
    ).toBe(200);
    let session = (await findBuyerSession(
      tenant,
      [...memory.cookies.values()][0],
    ))!;
    const customer = (
      await getPool().query(
        "insert into commerce_customers(tenant_id,email,name) values($1,'buyer@example.test','Comprador teste') returning id",
        [tenant],
      )
    ).rows[0].id;
    await getPool().query(
      "update commerce_sessions set customer_id=$2 where id=$1",
      [session.id, customer],
    );
    session = { ...session, customer_id: customer };
    const store = (await getCommerceStore(slug))!;
    const lines = [
      {
        id: randomUUID(),
        productId: product.id,
        artworkId: artwork.id,
        artworkName: "Flores",
        quantity: 13,
        preparation: "customer" as const,
      },
    ];
    await replaceCart(store, session, session.revision, lines);
    session = (await findBuyerSession(
      tenant,
      [...memory.cookies.values()][0],
    ))!;
    const calculation = await calculateCommerceCart(
      tenant,
      session.id,
      lines,
      await commerceProducts(tenant),
    );
    const order = await createCommerceOrder(store, session, {
      revision: session.revision,
      expectedTotalCents: calculation.totalCents,
      billing: testCommerceBilling,
      address: null,
      delivery: "pickup",
      deliveryAddressSameAsBilling: true,
      provider: "manual",
      acceptedTerms: true,
    });
    expect(
      (
        await getPool().query(
          "select * from commerce_artwork_proofs where tenant_id=$1 and order_id=$2",
          [tenant, order.id],
        )
      ).rows,
    ).toHaveLength(1);
    const oldPath = (
      await getPool().query(
        "select storage_path from commerce_artworks where id=$1",
        [artwork.id],
      )
    ).rows[0].storage_path;
    await saveArt({ status: "archived" });
    expect((await readCommerceLibrary(tenant, query())).total).toBe(0);
    expect(memory.files.has(oldPath)).toBe(true);
    expect(
      (
        await getPool().query(
          "select snapshot->'lines' as lines from commerce_orders where id=$1",
          [order.id],
        )
      ).rows[0].lines[0].artworkId,
    ).toBe(artwork.id);
    expect(
      (
        await prepareArt(
          request(`/api/store/${slug}/artworks/${artwork.id}`, {
            action: "prepare",
          }),
          context,
        )
      ).status,
    ).toBe(409);
  });
});
