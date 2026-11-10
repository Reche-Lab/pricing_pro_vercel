import { z } from "zod";
import { CommerceError } from "./commerce";
import { safeCommerceMediaUrl } from "./product-media";
export const librarySlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
export const librarySearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .slice(0, 3000);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const version = {
  id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
};
const ids = z
  .array(z.string().uuid())
  .max(200)
  .refine(
    (list) => new Set(list).size === list.length,
    "Não repita os vínculos.",
  );
export const libraryCropSchema = z
  .object({
    scale: z.number().min(0.1).max(5),
    offsetX: z.number().min(-1).max(1),
    offsetY: z.number().min(-1).max(1),
    rotationDegrees: z.number().min(-180).max(180),
  })
  .strict();
export type LibraryCrop = z.infer<typeof libraryCropSchema>;
export const libraryUploadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    fileSize: z.number().int().positive().max(3145728),
    dataUrl: z.string().max(4200000),
    categoryId: z.string().uuid().nullable(),
    campaignIds: ids,
    productIds: ids,
    licenseNote: z
      .string()
      .trim()
      .min(5, "Informe a origem e a autorização de uso.")
      .max(1000),
    rightsConfirmed: z.literal(true),
  })
  .strict();
export const libraryCommandSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("settings"), enabled: z.boolean() }).strict(),
    z.object({ action: z.literal("starter") }).strict(),
    z
      .object({
        action: z.literal("category.save"),
        ...version,
        name: z.string().trim().min(2).max(80),
        slug,
        parentId: z.string().uuid().nullable(),
        active: z.boolean(),
      })
      .strict(),
    z
      .object({
        action: z.literal("campaign.save"),
        ...version,
        name: z.string().trim().min(2).max(100),
        slug,
        description: z.string().trim().max(1000),
        coverUrl: safeCommerceMediaUrl,
        status: z.enum(["draft", "published", "archived"]),
        featured: z.boolean(),
        startsAt: z.string().datetime().nullable(),
        endsAt: z.string().datetime().nullable(),
      })
      .strict(),
    z
      .object({
        action: z.literal("artwork.save"),
        id: z.string().uuid(),
        revision: z.number().int().positive(),
        title: z.string().trim().min(2).max(120),
        description: z.string().trim().max(1000),
        tags: z.array(z.string().trim().min(1).max(40)).max(20),
        categoryId: z.string().uuid().nullable(),
        campaignIds: ids,
        productIds: ids,
        status: z.enum(["draft", "published", "archived"]),
        editable: z.boolean(),
        licenseNote: z.string().trim().min(5).max(1000),
      })
      .strict(),
    z
      .object({
        action: z.literal("binding.save"),
        artworkId: z.string().uuid(),
        productId: z.string().uuid(),
        revision: z.number().int().positive(),
        crop: libraryCropSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal("delete"),
        kind: z.enum(["category", "campaign"]),
        id: z.string().uuid(),
        revision: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        action: z.literal("reorder"),
        kind: z.enum(["category", "campaign"]),
        ids,
      })
      .strict(),
  ])
  .superRefine((input, ctx) => {
    if (
      input.action === "campaign.save" &&
      input.startsAt &&
      input.endsAt &&
      new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()
    )
      ctx.addIssue({
        code: "custom",
        message: "O fim precisa ser posterior ao início.",
        path: ["endsAt"],
      });
    if (
      input.action === "campaign.save" &&
      input.status === "published" &&
      !input.coverUrl
    )
      ctx.addIssue({
        code: "custom",
        message: "Envie uma capa para publicar a campanha.",
        path: ["coverUrl"],
      });
    if (
      (input.action === "category.save" || input.action === "campaign.save") &&
      Boolean(input.id) !== Boolean(input.revision)
    )
      ctx.addIssue({
        code: "custom",
        message: "Atualize a versão antes de salvar.",
      });
    if (
      input.action === "artwork.save" &&
      input.status === "published" &&
      !input.productIds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Vincule ao menos um produto para publicar.",
        path: ["productIds"],
      });
  });
export type LibraryCommand = z.infer<typeof libraryCommandSchema>;
export type LibraryCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  active: boolean;
  sort_order: number;
  revision: number;
};
export type LibraryCampaign = {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover_url: string;
  status: string;
  featured: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  revision: number;
  artwork_count?: number;
};
export type LibraryArtwork = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category_id: string | null;
  status: string;
  editable: boolean;
  version: string;
  revision: number;
  file_name: string;
  license_note?: string;
  width: number;
  height: number;
  campaign_ids: string[];
  product_ids: string[];
  bindings?: { product_id: string; initial_crop: LibraryCrop | null }[];
};
export type LibraryResult = {
  enabled: boolean;
  categories: LibraryCategory[];
  campaigns: LibraryCampaign[];
  artworks: LibraryArtwork[];
  total: number;
  page: number;
  pageSize: number;
};
export const libraryQuerySchema = z
  .object({
    q: z.string().max(100).default(""),
    category: z.string().uuid().optional(),
    campaign: slug.optional(),
    product: z.string().uuid().optional(),
    artwork: z.string().uuid().optional(),
    status: z.enum(["all", "draft", "published", "archived"]).default("all"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;
export function campaignIsVisible(
  campaign: Pick<LibraryCampaign, "status" | "starts_at" | "ends_at">,
  now = new Date(),
) {
  return (
    campaign.status === "published" &&
    (!campaign.starts_at || new Date(campaign.starts_at) <= now) &&
    (!campaign.ends_at || new Date(campaign.ends_at) > now)
  );
}
export function assertCategoryParent(
  rows: Pick<LibraryCategory, "id" | "parent_id">[],
  id: string | null,
  parentId: string | null,
) {
  if (!parentId) return;
  const parent = rows.find((row) => row.id === parentId);
  if (
    !parent ||
    parent.parent_id ||
    id === parentId ||
    rows.some((row) => row.parent_id === id && id !== null)
  )
    throw new CommerceError(
      "Use uma categoria principal como pai. São permitidos dois níveis, sem ciclos.",
    );
}
