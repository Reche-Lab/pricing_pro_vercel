import { z } from "zod";
import { safeCommerceMediaUrl } from "./product-media";
import { BLOG_DESCRIPTION, storeBlogEnabled, type BlogArticle } from "./blog";

const shortText = (max: number) => z.string().trim().max(max, `Use até ${max} caracteres neste campo.`);
export const blogSlugSchema = z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letras minúsculas, números e hífens no endereço.");
const image = z.string().max(2048).refine(value => !value || safeCommerceMediaUrl.safeParse(value).success || /^\/studio\/blog\/ground-shop\/(encontros|lembrancas|campanhas|cotidiano)\.webp$/.test(value), "Envie uma imagem válida para o blog.");
export const blogSettingsSchema = z.object({
  enabled: z.boolean(), title: shortText(100).min(2, "Informe o título do blog."),
  description: shortText(500), eyebrow: shortText(100), tagline: shortText(240),
  heroImage: image, heroAlt: shortText(240), featuredSlug: blogSlugSchema.nullable(),
}).strict();
export const blogContentSchema = z.object({
  title: shortText(180).min(2, "Informe o título do artigo."), description: shortText(500),
  category: shortText(80), image, imageAlt: shortText(240), imageCaption: shortText(300).optional(), intro: shortText(8000), takeaway: shortText(3000),
  productTerms: z.array(shortText(80).min(1, "Preencha os termos dos produtos relacionados.")).max(20),
  sections: z.array(z.object({
    id: blogSlugSchema, title: shortText(180).min(1, "Informe o título de cada seção."),
    paragraphs: z.array(shortText(8000).min(1, "Preencha o texto da seção.")).min(1, "Escreva ao menos um parágrafo em cada seção.").max(30),
    tips: z.array(shortText(1000).min(1, "Preencha ou remova a dica vazia.")).max(20).optional(),
  }).strict()).max(30).refine(items => new Set(items.map(s => s.id)).size === items.length, "As seções precisam ter identificadores diferentes."),
  questions: z.array(z.object({ question: shortText(300).min(1, "Preencha ou remova a pergunta vazia."), answer: shortText(3000).min(1, "Escreva a resposta de cada pergunta.") }).strict()).max(20),
  sources: z.array(z.object({ title: shortText(180).min(1, "Informe o nome de cada fonte."), url: safeCommerceMediaUrl.refine(Boolean, "Informe um link HTTPS para a fonte.") }).strict()).max(20).optional(),
}).strict();
export const blogStatusSchema = z.enum(["draft", "published", "archived"]);
export const blogSaveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), revision: z.number().int().nonnegative(), settings: blogSettingsSchema }).strict(),
  z.object({ action: z.literal("article"), revision: z.number().int().nonnegative(), slug: blogSlugSchema, status: blogStatusSchema, content: blogContentSchema }).strict(),
]);
export type BlogSettings = z.infer<typeof blogSettingsSchema>;
export type BlogContent = z.infer<typeof blogContentSchema>;
export type BlogSave = z.infer<typeof blogSaveSchema>;
export type BlogPost = { article: BlogArticle; revision: number; status: z.infer<typeof blogStatusSchema> };
export type PublicBlog = { settings: BlogSettings; articles: BlogArticle[]; updated?: string };
export type BlogAdminData = { settings: BlogSettings; revision: number; posts: BlogPost[]; migrationRequired: boolean; updated?: string };

export function defaultBlogSettings(slug: string, name: string): BlogSettings {
  return {
    enabled: storeBlogEnabled(slug), title: `Blog ${name}`.slice(0, 100), description: storeBlogEnabled(slug) ? BLOG_DESCRIPTION : `Ideias e novidades da ${name}.`,
    eyebrow: "Pequenos objetos. Boas histórias.", tagline: "Ideias que ficam.\nNa lapela, na rotina, na memória.",
    heroImage: "", heroAlt: "", featuredSlug: null,
  };
}
export function articleContent(article: BlogArticle): BlogContent {
  return blogContentSchema.strip().parse(article);
}
export function articlePublicationIssues(content: BlogContent) {
  const missing: string[] = [];
  if (!content.description) missing.push("resumo");
  if (!content.category) missing.push("categoria");
  if (!content.image) missing.push("imagem de capa");
  if (!content.imageAlt) missing.push("descrição da imagem");
  if (!content.intro) missing.push("introdução");
  if (!content.sections.length) missing.push("ao menos uma seção de conteúdo");
  return missing;
}
