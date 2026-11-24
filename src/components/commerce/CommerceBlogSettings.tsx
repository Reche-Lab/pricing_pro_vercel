"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Eye, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { articleContent, blogContentSchema, blogSaveSchema, type BlogAdminData, type BlogContent, type BlogPost, type BlogSave } from "@/domain/commerce/blog-settings";
import { normalizeBlogSearch } from "@/domain/commerce/blog";
import { CommerceImageUpload } from "./CommerceImageUpload";
import { LibraryDialog } from "./LibraryUI";
import { storeRequest } from "./store-http";
import styles from "./blog-admin.module.css";

const endpoint = "/api/commerce/admin/blog";
const statusLabel = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };
type SectionDraft = { id: string; title: string; body: string; tips: string };
type Draft = Omit<BlogContent, "sections" | "productTerms"> & { sections: SectionDraft[]; terms: string };
const slugify = (text: string) => normalizeBlogSearch(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
const lines = (text: string) => text.split("\n").map(s => s.trim()).filter(Boolean);
const emptyContent: BlogContent = { title: "", description: "", category: "", image: "", imageAlt: "", imageCaption: "", intro: "", takeaway: "", productTerms: [], sections: [], questions: [], sources: [] };

function draftFrom(content: BlogContent): Draft {
  const { productTerms, sections, ...rest } = content;
  return { ...rest, terms: productTerms.join(", "), sections: sections.map(s => ({ id: s.id, title: s.title, body: s.paragraphs.join("\n\n"), tips: (s.tips ?? []).join("\n") })) };
}
function draftContent(draft: Draft): BlogContent {
  const { terms, sections, ...rest } = draft;
  return blogContentSchema.parse({ ...rest, productTerms: terms.split(",").map(s => s.trim()).filter(Boolean), sections: sections.map(s => ({ id: s.id, title: s.title, paragraphs: s.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean), tips: lines(s.tips) })) });
}

function BlogArticleEditor({ post, slug: storeSlug, onSave, onClose, onBusyChange }: {
  post?: BlogPost; slug: string; onSave: (input: BlogSave) => Promise<void>; onClose: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(post ? articleContent(post.article) : emptyContent));
  const [address, setAddress] = useState(post?.article.slug ?? ""), [addressEdited, setAddressEdited] = useState(false);
  const [status, setStatus] = useState<BlogPost["status"]>(post?.status ?? "draft");
  const [error, setError] = useState(""), [saving, setSaving] = useState(false), [uploads, setUploads] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set(post?.article.sections.slice(0, 1).map(s => s.id) ?? []));
  const original = JSON.stringify({ draft: draftFrom(post ? articleContent(post.article) : emptyContent), address: post?.article.slug ?? "", status: post?.status ?? "draft" });
  const dirty = JSON.stringify({ draft, address, status }) !== original;
  const busy = saving || uploads > 0;
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); }
  function section(index: number, patch: Partial<SectionDraft>) { setDraft(current => ({ ...current, sections: current.sections.map((s, i) => i === index ? { ...s, ...patch } : s) })); }
  function move(index: number, offset: number) {
    const next = [...draft.sections]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; change("sections", next);
  }
  function addSection() {
    const id = `secao-${crypto.randomUUID().slice(0, 8)}`;
    setExpanded(current => new Set([...current, id]));
    change("sections", [...draft.sections, { id, title: "", body: "", tips: "" }]);
  }
  const uploadBusy = (value: boolean) => setUploads(n => Math.max(0, n + (value ? 1 : -1)));
  return <LibraryDialog wide title={post ? "Editar artigo" : "Novo artigo"} busy={busy} onClose={() => dirty ? setConfirmClose(true) : onClose()}>
    <form className={styles.editor} onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError("");
      try {
        const content = draftContent(draft);
        const input = blogSaveSchema.parse({ action: "article", slug: address, status, revision: post?.revision ?? 0, content });
        setSaving(true); await onSave(input);
      } catch (cause) {
        setError(cause && typeof cause === "object" && "issues" in cause ? String((cause as { issues: { message: string }[] }).issues[0]?.message ?? "Confira os campos.") : cause instanceof Error ? cause.message : "Não foi possível salvar.");
      } finally { setSaving(false); }
    }}>
      {confirmClose ? <div className={styles.notice} role="alert"><p>Há alterações não salvas neste artigo.</p><div className={styles.actions}><button type="button" onClick={() => setConfirmClose(false)}>Continuar editando</button><button type="button" onClick={onClose}>Descartar alterações</button></div></div> : null}
      <fieldset disabled={busy}>
        <div className={styles.columns}>
          <label className={styles.full}>Título<input value={draft.title} maxLength={180} required onChange={e => { change("title", e.target.value); if (!post && !addressEdited) setAddress(slugify(e.target.value)); }}/></label>
          <label>Categoria<input value={draft.category} maxLength={80} onChange={e => change("category", e.target.value)}/></label>
          <label>Publicação<select value={status} onChange={e => setStatus(e.target.value as BlogPost["status"])}><option value="draft">Rascunho · somente na prévia</option><option value="published">Publicado · visível na loja</option><option value="archived">Arquivado · fora da loja</option></select></label>
          <label className={styles.full}>Endereço do artigo<input value={address} readOnly={Boolean(post)} maxLength={100} required onChange={e => { setAddressEdited(true); setAddress(e.target.value); }}/><small>{post ? "Endereço preservado para manter os links existentes." : "Letras minúsculas, números e hífens. O endereço será preservado após salvar."}</small></label>
          <label className={styles.full}>Resumo para a listagem e buscas<textarea value={draft.description} maxLength={500} rows={3} onChange={e => change("description", e.target.value)}/></label>
        </div>
        <section className={styles.editorSection} aria-label="Imagem do artigo">
          <CommerceImageUpload label="Capa do artigo" purpose="cover" value={draft.image} onChange={url => change("image", url)} onBusyChange={uploadBusy} saveHint="Salve o artigo para aplicar."/>
          <div className={styles.columns}><label className={styles.full}>Descrição da imagem (acessibilidade)<input value={draft.imageAlt} maxLength={240} onChange={e => change("imageAlt", e.target.value)}/></label><label className={styles.full}>Legenda ou crédito da imagem<input value={draft.imageCaption ?? ""} maxLength={300} onChange={e => change("imageCaption", e.target.value)} placeholder="Opcional"/></label></div>
        </section>
        <section className={styles.editorSection} aria-label="Texto de abertura"><label>Introdução<textarea value={draft.intro} rows={5} maxLength={8000} onChange={e => change("intro", e.target.value)}/></label><label>Ideia principal para guardar<textarea value={draft.takeaway} rows={3} maxLength={3000} onChange={e => change("takeaway", e.target.value)}/></label></section>
        <section className={styles.editorSection} aria-labelledby="blog-content-title"><div className={styles.heading}><h3 id="blog-content-title">Conteúdo do artigo</h3><button type="button" disabled={draft.sections.length >= 30} onClick={addSection}><Plus size={16}/>Adicionar seção</button></div>
          {draft.sections.map((s, index) => <details key={s.id} className={styles.section} open={expanded.has(s.id)} onToggle={e => { const open = e.currentTarget.open; setExpanded(current => { if (current.has(s.id) === open) return current; const next = new Set(current); if (open) next.add(s.id); else next.delete(s.id); return next; }); }}><summary>{s.title || `Nova seção ${index + 1}`}</summary><div className={styles.sectionBody}><label>Título da seção<input value={s.title} maxLength={180} onChange={e => section(index, { title: e.target.value })}/></label><label>Texto<textarea value={s.body} rows={7} onChange={e => section(index, { body: e.target.value })}/><small>Separe os parágrafos com uma linha em branco.</small></label><label>Dicas em lista (opcional)<textarea value={s.tips} rows={3} onChange={e => section(index, { tips: e.target.value })}/><small>Uma dica por linha.</small></label><div className={styles.actions}><button type="button" title="Mover seção para cima" aria-label={`Mover seção ${index + 1} para cima`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button type="button" title="Mover seção para baixo" aria-label={`Mover seção ${index + 1} para baixo`} disabled={index === draft.sections.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16}/></button><button type="button" title="Remover esta seção" onClick={() => change("sections", draft.sections.filter((_, i) => i !== index))}><Trash2 size={16}/>Remover seção</button></div></div></details>)}
        </section>
        <details className={styles.section}><summary>Perguntas frequentes ({draft.questions.length})</summary><div className={styles.sectionBody}>{draft.questions.map((q, index) => <div className={styles.question} key={index}><label>Pergunta<input value={q.question} maxLength={300} onChange={e => change("questions", draft.questions.map((item, i) => i === index ? { ...item, question: e.target.value } : item))}/></label><label>Resposta<textarea value={q.answer} rows={3} maxLength={3000} onChange={e => change("questions", draft.questions.map((item, i) => i === index ? { ...item, answer: e.target.value } : item))}/></label><button type="button" title="Remover pergunta" aria-label={`Remover pergunta ${index + 1}`} onClick={() => change("questions", draft.questions.filter((_, i) => i !== index))}><Trash2 size={16}/></button></div>)}<button type="button" disabled={draft.questions.length >= 20} onClick={() => change("questions", [...draft.questions, { question: "", answer: "" }])}><Plus size={16}/>Adicionar pergunta</button></div></details>
        <details className={styles.section}><summary>Produtos relacionados e fontes</summary><div className={styles.sectionBody}><label>Termos dos produtos relacionados<input value={draft.terms} maxLength={1600} onChange={e => change("terms", e.target.value)} placeholder="botton, espelho, ímã"/><small>Separe por vírgula. As sugestões usam os nomes do catálogo desta loja.</small></label>{(draft.sources ?? []).map((source, index) => <div key={index} className={styles.question}><label>Nome da fonte<input value={source.title} maxLength={180} onChange={e => change("sources", draft.sources!.map((s, i) => i === index ? { ...s, title: e.target.value } : s))}/></label><label>Link HTTPS<input value={source.url} type="url" maxLength={2048} onChange={e => change("sources", draft.sources!.map((s, i) => i === index ? { ...s, url: e.target.value } : s))}/></label><button type="button" title="Remover fonte" aria-label={`Remover fonte ${index + 1}`} onClick={() => change("sources", draft.sources!.filter((_, i) => i !== index))}><Trash2 size={16}/></button></div>)}<button type="button" disabled={(draft.sources?.length ?? 0) >= 20} onClick={() => change("sources", [...(draft.sources ?? []), { title: "", url: "" }])}><Plus size={16}/>Adicionar fonte</button></div></details>
      </fieldset>
      <footer className={styles.editorFooter}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.actions}><span className={styles.hint}>{uploads ? "Enviando imagem…" : status === "published" ? "As alterações salvas aparecerão na loja." : status === "draft" ? "Rascunhos não aparecem no blog público." : "O artigo ficará fora da loja e da prévia."}</span>{post && !dirty && post.status !== "archived" ? <a href={`/commerce/${storeSlug}/preview/blog/${post.article.slug}`} target="_blank" rel="noopener noreferrer"><Eye size={16}/>Prévia salva</a> : null}<button type="button" disabled={busy} onClick={() => dirty ? setConfirmClose(true) : onClose()}>Cancelar</button><button className={styles.primary} disabled={busy} type="submit">{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} {status === "published" ? "Salvar e publicar" : status === "archived" ? "Salvar e arquivar" : "Salvar rascunho"}</button></div></footer>
    </form>
  </LibraryDialog>;
}

export function CommerceBlogSettings({ slug, onBusyChange }: { slug: string; onBusyChange: (busy: boolean) => void }) {
  const [data, setData] = useState<BlogAdminData | null>(null), [settings, setSettings] = useState<BlogAdminData["settings"] | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [uploads, setUploads] = useState(0);
  const [editorBusy, setEditorBusy] = useState(false), [settingsRevision, setSettingsRevision] = useState(0);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ post?: BlogPost } | null>(null);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("");
  const busy = saving || uploads > 0;
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result: BlogAdminData = await storeRequest(endpoint); setData(result); setSettings(result.settings); setSettingsRevision(result.revision); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o blog."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onBusyChange(busy || editorBusy); return () => onBusyChange(false); }, [busy, editorBusy, onBusyChange]);
  async function save(input: BlogSave) {
    setSaving(true); setError(""); setMessage("");
    try { const result: BlogAdminData & { message: string } = await storeRequest(endpoint, "PUT", input); setData(result); if (input.action === "settings") { setSettings(result.settings); setSettingsRevision(result.revision); } setMessage(result.message); if (input.action === "article") setEditor(null); }
    finally { setSaving(false); }
  }
  const filtered = data?.posts.filter(post => (!filter || post.status === filter) && normalizeBlogSearch(`${post.article.title} ${post.article.category}`).includes(normalizeBlogSearch(search))) ?? [];
  if (loading) return <p role="status" className={styles.loading}><Loader2 className="animate-spin" size={18}/>Carregando o blog…</p>;
  if (!data || !settings) return <div className={styles.root}><p role="alert" className={styles.error}>{error}</p><button type="button" onClick={() => void load()}><RefreshCw size={16}/>Tentar novamente</button></div>;
  return <section className={styles.root} aria-label="Configuração do blog">
    <header className={styles.heading}><div><h2><BookOpen size={20}/>Blog da loja</h2><p>Histórias, imagens e informações para os visitantes da sua loja.</p></div><a href={`/commerce/${slug}/preview/blog`} target="_blank" rel="noopener noreferrer"><Eye size={16}/>Prévia do blog</a></header>
    {data.migrationRequired ? <p role="alert" className={styles.notice}>Aplique a migration <code>0086_commerce_blog.sql</code> para habilitar o salvamento. O conteúdo atual permanece disponível.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}{message ? <p role="status" className={styles.success}>{message}</p> : null}
    <details className={styles.presentation}><summary>Apresentação do blog <span>{data.settings.enabled ? "Habilitado" : "Desativado"}</span></summary><form onSubmit={async e => { e.preventDefault(); try { await save({ action: "settings", revision: settingsRevision, settings }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); } }}>
      <fieldset disabled={busy || data.migrationRequired}><label className={styles.check}><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })}/>Exibir o blog na loja</label><div className={styles.columns}><label>Título do blog<input value={settings.title} maxLength={100} required onChange={e => setSettings({ ...settings, title: e.target.value })}/></label><label>Chamada acima do título<input value={settings.eyebrow} maxLength={100} onChange={e => setSettings({ ...settings, eyebrow: e.target.value })}/></label><label className={styles.full}>Mensagem de abertura<textarea rows={3} value={settings.tagline} maxLength={240} onChange={e => setSettings({ ...settings, tagline: e.target.value })}/></label><label className={styles.full}>Descrição do blog e das buscas<textarea rows={3} value={settings.description} maxLength={500} onChange={e => setSettings({ ...settings, description: e.target.value })}/></label><label className={styles.full}>Artigo em destaque<select value={settings.featuredSlug ?? ""} onChange={e => setSettings({ ...settings, featuredSlug: e.target.value || null })}><option value="">Primeiro artigo disponível</option>{data.posts.filter(post => post.status !== "archived").map(post => <option key={post.article.slug} value={post.article.slug}>{post.article.title} · {statusLabel[post.status]}</option>)}</select></label></div><CommerceImageUpload label="Imagem de abertura do blog" purpose="cover" value={settings.heroImage} onChange={url => setSettings(current => current ? { ...current, heroImage: url } : current)} onBusyChange={value => setUploads(n => Math.max(0, n + (value ? 1 : -1)))} saveHint="Salve a apresentação para aplicar."/><p className={styles.hint}>Sem imagem própria, será usada a capa do artigo em destaque.</p><label>Descrição da imagem de abertura<input value={settings.heroAlt} maxLength={240} required={Boolean(settings.heroImage)} onChange={e => setSettings({ ...settings, heroAlt: e.target.value })}/></label></fieldset><div className={styles.actions}><button type="button" disabled={busy} onClick={() => setSettings(data.settings)}>Descartar alterações</button><button className={styles.primary} disabled={busy || data.migrationRequired}>{saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}Salvar apresentação</button></div>
    </form></details>
    <section aria-labelledby="blog-admin-articles"><div className={styles.heading}><h3 id="blog-admin-articles">Artigos <small>{data.posts.length}</small></h3><button className={styles.primary} type="button" disabled={busy || data.migrationRequired || data.posts.length >= 100} onClick={() => setEditor({})}><Plus size={16}/>Novo artigo</button></div><div className={styles.toolbar}><label><Search size={16}/><input type="search" aria-label="Buscar artigos" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar título ou categoria"/></label><select aria-label="Filtrar publicação" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos os estados</option><option value="published">Publicados</option><option value="draft">Rascunhos</option><option value="archived">Arquivados</option></select></div><div className={styles.list}>{filtered.map(post => <article key={post.article.slug} className={styles.row}><div className={styles.thumbnail}>{post.article.image ? <img src={post.article.image} alt="" width={96} height={64} loading="lazy"/> : <BookOpen size={24}/>}</div><div className={styles.rowCopy}><div className={styles.meta}><span data-status={post.status}>{statusLabel[post.status]}</span><span>{post.article.category || "Sem categoria"}</span></div><h4>{post.article.title}</h4><p>{post.article.description || "Sem resumo"}</p></div><div className={styles.actions}>{post.status !== "archived" ? <a title="Abrir a versão salva na prévia" aria-label={`Prévia de ${post.article.title}`} href={`/commerce/${slug}/preview/blog/${post.article.slug}`} target="_blank" rel="noopener noreferrer"><Eye size={17}/></a> : null}<button type="button" disabled={busy || data.migrationRequired} title="Editar textos e imagem do artigo" aria-label={`Editar ${post.article.title}`} onClick={() => { setMessage(""); setEditor({ post }); }}><Pencil size={16}/>Editar</button></div></article>)}</div>{!filtered.length ? <p className={styles.hint}>{data.posts.length ? "Nenhum artigo encontrado com esses filtros." : "Crie o primeiro artigo para começar o blog desta loja."}</p> : null}</section>
    {editor ? <BlogArticleEditor key={editor.post?.article.slug ?? "new"} post={editor.post} slug={slug} onSave={save} onClose={() => setEditor(null)} onBusyChange={setEditorBusy}/> : null}
  </section>;
}
