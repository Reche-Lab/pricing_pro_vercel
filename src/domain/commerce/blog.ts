export type BlogSection = { id: string; title: string; paragraphs: string[]; tips?: string[] };
export type BlogArticle = {
  slug: string; title: string; description: string; category: string;
  image: string; imageAlt: string; published: string; updated: string;
  intro: string; takeaway: string; productTerms: string[];
  sections: BlogSection[]; questions: { question: string; answer: string }[];
  sources?: { title: string; url: string }[];
};
export type BlogCard = Pick<BlogArticle, "slug" | "title" | "description" | "category" | "image" | "imageAlt"> & { minutes: number };

export const BLOG_DESCRIPTION = "Ideias, curiosidades e guias para personalizar bottons, espelhos, abridores, ímãs e chaveiros. Do primeiro rascunho ao próximo encontro.";
export const storeBlogEnabled = (slug: string) => slug === "ground-shop";
export const blogPath = (base: string, slug?: string) => `${base}/blog${slug ? `/${encodeURIComponent(slug)}` : ""}`;
export const normalizeBlogSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function blogMinutes(article: BlogArticle) {
  const text = [article.intro, article.takeaway, ...article.sections.flatMap(s => [s.title, ...s.paragraphs, ...(s.tips ?? [])]), ...article.questions.flatMap(q => [q.question, q.answer])].join(" ");
  return Math.max(2, Math.ceil(text.split(/\s+/).length / 190));
}
export function blogCard(article: BlogArticle): BlogCard {
  const { slug, title, description, category, image, imageAlt } = article;
  return { slug, title, description, category, image, imageAlt, minutes: blogMinutes(article) };
}
export function filterBlogCards(articles: BlogCard[], query: string, category: string) {
  const terms = normalizeBlogSearch(query).trim().split(/\s+/).filter(Boolean);
  return articles.filter(a => (!category || a.category === category) && terms.every(term => normalizeBlogSearch(`${a.title} ${a.description} ${a.category}`).includes(term)));
}
