"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlignCenter, ArrowRight, Check, Circle, FilePlus2, Image as ImageIcon, Images, Info, Loader2, Orbit, Paintbrush, Plus, SkipForward, Sparkles, Type, Undo2, X } from "lucide-react";
import type { StoreProduct } from "./StoreHome";
import type { StudioArtwork, StudioGradient } from "@/domain/commerce/studio-artwork";
import { STUDIO_DEMO_STEPS, studioInitialArtwork } from "@/domain/commerce/studio-demo";
import { renderStudioArtwork } from "./studio-artwork-canvas";
import { StoreProductMockup } from "./StoreProductMockup";
import { StudioImageControls } from "./StudioImageControls";
import { useCommercePreview } from "./CommercePreviewProvider";
import { saveStudioPurchase, type StudioSaveProgress } from "./studio-purchase";
import { readStudioDraft, writeStudioDraft } from "./studio-draft-cache";
import type { StudioDraft } from "@/domain/commerce/studio-draft";
import { validateStudioLibraryAsset } from "./studio-library";
import styles from "./studio.module.css";
const LibraryPicker = dynamic(() => import("./StudioLibraryPicker").then(module => module.StudioLibraryPicker), { ssr: false });

const presets = [{ name: "Verde", background: "#226d5c", ink: "#ffffff" }, { name: "Coral", background: "#a52e48", ink: "#ffffff" }, { name: "Amarelo", background: "#f2cc59", ink: "#242b25" }];
const extraColors = ["#226d5c", "#f2cc59", "#e96982", "#427db5"];
const frame = { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 };
const textModes = [
  { value: "centered", label: "Em linhas", title: "Texto centralizado em linhas", Icon: AlignCenter },
  { value: "circle", label: "Circular", title: "Texto circular", Icon: Circle },
  { value: "spiral", label: "Espiral", title: "Texto em espiral", Icon: Orbit },
] as const;

export function StudioPersonalizer({ products, base, slug, preview = false, autoDemo = false, libraryEnabled = false }: { products: StoreProduct[]; base: string; slug: string; preview?: boolean; autoDemo?: boolean; libraryEnabled?: boolean }) {
  const id = useId();
  const router = useRouter(), simulation = useCommercePreview();
  const savingRef = useRef(false), progress = useRef<StudioSaveProgress>({ artworkId: null, prepared: false });
  const [selected, setSelected] = useState(products[0]?.id);
  const [artwork, setArtwork] = useState<StudioArtwork>(studioInitialArtwork);
  const [tab, setTab] = useState<"text" | "background">("text");
  const [source, setSource] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [truncated, setTruncated] = useState(false);
  const [saving, setSaving] = useState(false), [imageBusy, setImageBusy] = useState(false), [saveError, setSaveError] = useState("");
  const [draftReady, setDraftReady] = useState(false), [lastDraft, setLastDraft] = useState<StudioDraft | null>(null), [cacheWarning, setCacheWarning] = useState(false), [restored, setRestored] = useState(false), [libraryOpen, setLibraryOpen] = useState(false);
  const dirty = useRef(false), latestDraft = useRef<StudioDraft | null>(null);
  const [introStep, setIntroStep] = useState<number | null>(autoDemo ? -1 : null), [introPaused, setIntroPaused] = useState(false);
  const introRunning = useRef(autoDemo), focusRequested = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null), previewRef = useRef<HTMLDivElement>(null);
  const introActive = introStep !== null && introStep < STUDIO_DEMO_STEPS.length;
  const introComplete = introStep === STUDIO_DEMO_STEPS.length;
  const product = products.find(item => item.id === selected) ?? products[0];
  const geometry = product?.geometry, margins = product?.margins;
  useEffect(() => {
    let active = true;
    void readStudioDraft({ slug, preview }).then(draft => {
      if (!active) return;
      if (draft) {
        setArtwork(draft.artwork); setSelected(current => products.some(item => item.id === draft.productId) ? draft.productId : current);
        setLastDraft(draft); setRestored(true); introRunning.current = false; setIntroStep(null);
      }
      setDraftReady(true);
    });
    return () => { active = false; };
    // A draft belongs to this store/preview; changing the product never reloads an older recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, preview]);
  useEffect(() => {
    if (!draftReady || !dirty.current || !product) return;
    const draft: StudioDraft = { version: 1, updatedAt: Date.now(), productId: product.id, artwork };
    latestDraft.current = draft;
    let active = true;
    const timer = setTimeout(() => { void writeStudioDraft({ slug, preview }, draft).then(persistent => { if (active) { setLastDraft(current => !current || current.updatedAt <= draft.updatedAt ? draft : current); setCacheWarning(!persistent); } }); }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [artwork, selected, draftReady, product, slug, preview]);
  useEffect(() => () => { if (dirty.current && latestDraft.current) void writeStudioDraft({ slug, preview }, latestDraft.current); }, [slug, preview]);
  useEffect(() => {
    if (!geometry || !margins) return;
    let active = true;
    setBusy(true); setError("");
    const timer = window.setTimeout(() => {
      void renderStudioArtwork(artwork, geometry, margins).then(result => {
        if (active) { setSource(result.dataUrl); setTruncated(result.truncated); }
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o exemplo."); })
        .finally(() => { if (active) setBusy(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [artwork, geometry, margins]);
  useEffect(() => {
    if (!autoDemo) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    previewRef.current?.scrollIntoView?.({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
    let inView = true;
    const refresh = () => {
      setIntroPaused(document.hidden || !inView);
      if (motion.matches && introRunning.current) { introRunning.current = false; setIntroStep(STUDIO_DEMO_STEPS.length); }
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? false; refresh(); }, { threshold: .15 });
    if (previewRef.current) observer?.observe(previewRef.current);
    motion.addEventListener("change", refresh); document.addEventListener("visibilitychange", refresh); refresh();
    return () => { observer?.disconnect(); motion.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [autoDemo]);
  useEffect(() => {
    if (!draftReady || !introRunning.current || introStep === null || !source || busy || error || introPaused) return;
    // Wait for each artwork render before starting the next stage's viewing time.
    const timer = window.setTimeout(() => {
      if (!introRunning.current) return;
      const next = introStep + 1;
      if (next === STUDIO_DEMO_STEPS.length) { introRunning.current = false; setIntroStep(next); return; }
      const step = STUDIO_DEMO_STEPS[next];
      setArtwork(current => ({ ...current, ...step.artwork })); setTab(step.tab); setIntroStep(next);
    }, introStep < 0 ? 500 : 1800);
    return () => window.clearTimeout(timer);
  }, [introStep, source, busy, error, introPaused, draftReady]);
  useEffect(() => {
    if (!draftReady || !focusRequested.current || tab !== "text" || introStep !== null) return;
    focusRequested.current = false; messageRef.current?.focus(); messageRef.current?.select();
  }, [tab, introStep, draftReady]);
  if (!geometry || !product.artworkOptions?.mockup) return null;
  const interruptIntro = () => { introRunning.current = false; if (introStep !== null) setIntroStep(null); };
  const pauseIntro = () => { introRunning.current = false; };
  const captureClick = (event: React.MouseEvent) => {
    pauseIntro();
    // Controlled inputs must read their new value before any capture-phase rerender.
    if ((event.target as Element).closest("button")) interruptIntro();
  };
  const changeProduct = (id: string) => { dirty.current = true; interruptIntro(); resetProgress(); setSelected(id); };
  const restoreDraft = () => {
    if (!lastDraft) return;
    interruptIntro(); dirty.current = false; resetProgress(); setArtwork(lastDraft.artwork); setRestored(true);
  };
  const newArtwork = () => { interruptIntro(); dirty.current = false; latestDraft.current = null; resetProgress(); setArtwork(studioInitialArtwork()); setRestored(false); setTab("text"); };
  const createOwnArtwork = (skip = false) => {
    introRunning.current = false; focusRequested.current = true; setIntroStep(null); setTab("text");
    if (skip) setArtwork(studioInitialArtwork());
  };
  const resetProgress = () => { progress.current = { artworkId: null, prepared: false }; setSaveError(""); };
  const update = (patch: Partial<StudioArtwork>) => { if (savingRef.current) return; dirty.current = true; setRestored(false); interruptIntro(); resetProgress(); setArtwork(current => ({ ...current, ...patch })); };
  function changeGradient(gradient: StudioGradient) {
    dirty.current = true; interruptIntro(); resetProgress();
    setArtwork(current => ({ ...current, gradient, colors: gradient !== "solid" && current.colors.length === 1 ? [...current.colors, extraColors[1]] : current.colors }));
  }
  async function continueWithArtwork() {
    if (savingRef.current || introRunning.current || imageBusy || !slug || !geometry) return;
    savingRef.current = true; setSaving(true); setSaveError("");
    try {
      if (preview && !simulation) throw new Error("Reabra a prévia para continuar com sua arte.");
      if (artwork.backgroundType === "image" && !artwork.backgroundImage) throw new Error("Envie uma imagem de fundo ou escolha um fundo de cor.");
      if (artwork.backgroundType === "image" && artwork.backgroundImage?.asset.library) await validateStudioLibraryAsset(slug, preview, product.id, artwork.backgroundImage.asset.library);
      const draft: StudioDraft = { version: 1, updatedAt: Date.now(), productId: product.id, artwork };
      dirty.current = true; latestDraft.current = draft;
      const persistent = await writeStudioDraft({ slug, preview }, draft);
      setLastDraft(draft); setCacheWarning(!persistent);
      const rendered = await renderStudioArtwork(artwork, geometry, margins, { purpose: "purchase" });
      if (rendered.truncated) throw new Error("Encurte sua mensagem para que todas as letras caibam na área segura.");
      const file = { fileName: `arte-estudio.${rendered.mimeType === "image/webp" ? "webp" : "png"}`, dataUrl: rendered.dataUrl, mimeType: rendered.mimeType, fileSize: rendered.fileSize };
      const artworkId = await saveStudioPurchase({ slug, productId: product.id, file, progress: progress.current, preview: preview ? simulation! : undefined });
      router.push(`${base}/produto/${product.id}?arteEstudio=${encodeURIComponent(artworkId)}`);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Não foi possível salvar sua arte. Tente novamente."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <div className={styles.demoInner}>
    <div className={styles.demoHeader}>
      <p className={styles.eyebrow}><Paintbrush size={15}/>Seu pequeno estúdio de ideias</p>
      <h2>Crie sua arte. Veja dos dois lados.</h2>
      <p>Combine imagem, cores e mensagem. Continue com a sua criação para escolher a quantidade, revisar e aprovar antes da compra.</p>
    </div>
    <div className={styles.demoControlsArea}>
      {draftReady ? <div className={styles.draftBar}><small role="status">{lastDraft ? restored ? "Sua última arte foi recuperada." : "Última arte guardada nesta aba." : "Nova composição"}</small><button type="button" disabled={!lastDraft || saving || imageBusy} title="Recuperar a última composição sem trocar o produto atual" onClick={restoreDraft}><Undo2 size={15}/>Retomar</button><button type="button" disabled={saving || imageBusy} title="Começar outra composição; a anterior continua disponível até a próxima edição" onClick={newArtwork}><FilePlus2 size={15}/>Nova arte</button></div> : null}
      {cacheWarning ? <p role="status" className={styles.imageQuality}>O navegador não permitiu guardar a arte em disco. Ela está disponível nesta navegação; não recarregue nem feche a aba antes de continuar.</p> : null}
      {!draftReady ? <p role="status" className={styles.imageQuality}>Verificando sua última arte…</p> : null}
      <fieldset className={styles.demoControls} disabled={!draftReady || saving || imageBusy} aria-label="Criação da arte" onPointerDownCapture={pauseIntro} onKeyDownCapture={pauseIntro} onClickCapture={captureClick}>
        <div className={styles.controlField}><label htmlFor={`${id}-product`}>Produto</label><select id={`${id}-product`} value={product.id} onChange={event => changeProduct(event.target.value)}>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className={styles.demoTabs} role="tablist" aria-label="Personalização do exemplo">
          {([ ["text", "Texto", Type], ["background", "Fundo", Paintbrush] ] as const).map(([value, label, Icon]) => <button type="button" role="tab" key={value} id={`${id}-tab-${value}`} aria-selected={tab === value} aria-controls={`${id}-panel-${value}`} tabIndex={tab === value ? 0 : -1}
            onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { interruptIntro(); event.preventDefault(); const next = event.key === "Home" ? "text" : event.key === "End" ? "background" : tab === "text" ? "background" : "text"; setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus(); } }}
            onClick={() => setTab(value)}><Icon size={16}/>{label}</button>)}
        </div>
        <div role="tabpanel" id={`${id}-panel-text`} aria-labelledby={`${id}-tab-text`} hidden={tab !== "text"} className={styles.demoPanel}>
          <label className={styles.showText}><input type="checkbox" checked={artwork.showText !== false} onChange={event => update({ showText: event.target.checked })}/>Incluir texto sobre o fundo</label>
          <fieldset disabled={artwork.showText === false} className={styles.demoTextFields}>
          <div className={styles.controlField}><label htmlFor={`${id}-message`}>Sua mensagem</label><textarea ref={messageRef} id={`${id}-message`} value={artwork.text} maxLength={140} rows={3} onChange={event => update({ text: event.target.value })}/><small className={styles.messageCount}>{artwork.text.length}/140</small></div>
          <div className={styles.textModes} role="group" aria-label="Disposição do texto">{textModes.map(({ value, title, label, Icon }) => <button key={value} type="button" aria-label={title} title={value === "centered" ? "Quebra as linhas dentro da área segura do produto" : value === "circle" ? "Distribui as letras próximas à borda da área segura" : "Distribui as letras do centro para fora, em espiral"} aria-pressed={artwork.mode === value} onClick={() => update({ mode: value })}><Icon size={16}/>{label}</button>)}</div>
          <div className={styles.controlRow}>
            <div className={styles.controlField}><label htmlFor={`${id}-font`}>Fonte</label><select id={`${id}-font`} value={artwork.font} onChange={event => update({ font: event.target.value as StudioArtwork["font"] })}><option value="modern">Moderna</option><option value="editorial">Editorial · DM Serif</option><option value="handwritten">Manuscrita · Caveat</option><option value="bold">Marcante</option></select></div>
            <div className={styles.controlField}><label htmlFor={`${id}-ink`}>Cor do texto</label><input id={`${id}-ink`} type="color" value={artwork.textColor} onChange={event => update({ textColor: event.target.value })}/></div>
          </div>
          </fieldset>
        </div>
        <div role="tabpanel" id={`${id}-panel-background`} aria-labelledby={`${id}-tab-background`} hidden={tab !== "background"} className={styles.demoPanel}>
          <div className={styles.backgroundModes} role="group" aria-label="Tipo de fundo">{([ ["color", "Cor ou degradê", Paintbrush], ["image", "Imagem", ImageIcon] ] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={(artwork.backgroundType ?? "color") === value} onClick={() => update({ backgroundType: value })}><Icon size={16}/>{label}</button>)}</div>
          {artwork.backgroundType === "image" ? <><StudioImageControls image={artwork.backgroundImage} geometry={geometry} margins={margins} onChange={backgroundImage => update({ backgroundImage })} onBusyChange={setImageBusy}/>{libraryEnabled ? <button type="button" className={styles.imageLibraryButton} onClick={() => { interruptIntro(); setLibraryOpen(true); }}><Images size={17}/>Escolher entre nossas artes prontas</button> : null}</> : <>
          <fieldset className={styles.swatches}><legend>Paleta inicial</legend>{presets.map(item => <button type="button" key={item.name} aria-label={`Cor ${item.name.toLowerCase()}`} title={item.name} aria-pressed={artwork.colors[0] === item.background} onClick={() => update({ colors: [item.background, ...artwork.colors.slice(1)], textColor: item.ink })} style={{ background: item.background, color: item.ink }}>{artwork.colors[0] === item.background ? <Check size={17} className="mx-auto"/> : null}</button>)}</fieldset>
          <div className={styles.controlField}><label htmlFor={`${id}-gradient`}>Formato do fundo</label><select id={`${id}-gradient`} value={artwork.gradient} onChange={event => changeGradient(event.target.value as StudioGradient)}><option value="solid">Cor sólida</option><option value="horizontal">Degradê horizontal</option><option value="diagonal">Degradê diagonal</option><option value="radial">Degradê circular</option><option value="spiral">Degradê em espiral</option></select></div>
          <fieldset className={styles.colorStops}><legend>Cores do fundo <small>{artwork.colors.length}/4</small></legend><div className={styles.colorStopList}>{artwork.colors.map((color, index) => <div key={index} className={styles.colorStop}><label htmlFor={`${id}-color-${index}`}>Cor {index + 1}</label><input id={`${id}-color-${index}`} type="color" aria-label={`Cor do fundo ${index + 1}`} value={color} onChange={event => update({ colors: artwork.colors.map((value, at) => at === index ? event.target.value : value) })}/><button type="button" title={`Remover cor ${index + 1}`} aria-label={`Remover cor ${index + 1}`} disabled={artwork.colors.length === 1} onClick={() => { const colors = artwork.colors.filter((_, at) => at !== index); update({ colors, gradient: colors.length === 1 ? "solid" : artwork.gradient }); }}><X size={14}/></button></div>)}<button type="button" className={styles.addColor} aria-label="Adicionar cor ao fundo" title="Adicionar uma cor ao degradê, até quatro cores" disabled={artwork.colors.length === 4} onClick={() => update({ colors: [...artwork.colors, extraColors[artwork.colors.length]], gradient: artwork.gradient === "solid" ? "diagonal" : artwork.gradient })}><Plus size={19}/></button></div></fieldset>
          </>}
        </div>
      </fieldset>
      {error ? <p className={styles.demoError} role="alert">{error}</p> : null}
      {truncated ? <p className={styles.demoError} role="status">Encurte a mensagem para que todas as letras caibam na área segura deste produto.</p> : null}
      {saveError ? <p className={styles.demoError} role="alert">{saveError}</p> : null}
      <button type="button" className={styles.primary} disabled={!draftReady || introActive || saving || imageBusy || busy || truncated || artwork.backgroundType === "image" && !artwork.backgroundImage} onClick={() => void continueWithArtwork()}>{saving ? <Loader2 size={17} className="animate-spin"/> : <ArrowRight size={17}/>} {saving ? "Salvando sua arte…" : "Usar esta arte no produto"}</button>
    </div>
    <div ref={previewRef} className={styles.demoPreview} aria-busy={busy}>
      {draftReady && (introActive || introComplete) ? <div className={styles.introNotice} data-studio-demo-stage={introComplete ? "complete" : introStep}>
        <div><small><Sparkles size={13}/>{introComplete ? "Sua vez de criar" : "Demonstração rápida"}</small><p role="status" aria-live="polite">{introComplete ? "Agora crie você mesmo a sua arte." : introStep === -1 ? "Veja sua ideia ganhar forma." : STUDIO_DEMO_STEPS[introStep!].title}</p>
          {!introComplete ? <div className={styles.introProgress} role="progressbar" aria-label="Etapas da demonstração" aria-valuemin={0} aria-valuemax={STUDIO_DEMO_STEPS.length} aria-valuenow={Math.max(0, (introStep ?? -1) + 1)}>{STUDIO_DEMO_STEPS.map((_, index) => <span key={index} data-complete={index <= (introStep ?? -1)}/>)}</div> : null}
        </div>
        <button type="button" className={styles.secondary} aria-label={introComplete ? "Criar minha arte" : "Pular demonstração"} title={introComplete ? "Editar a mensagem e criar a sua própria arte" : "Pular o exemplo e começar a criar agora"} onClick={() => createOwnArtwork(!introComplete)}>{introComplete ? <ArrowRight size={15}/> : <SkipForward size={15}/>} {introComplete ? "Criar minha arte" : "Pular"}</button>
      </div> : null}
      <div className={styles.previewHeading}><strong>Sua arte em tempo real</strong><span role="status">{busy ? <><Loader2 size={13} className="animate-spin"/>Atualizando</> : "Frente e verso"}</span></div>
      <div className={styles.previewPair} onPointerDownCapture={pauseIntro} onClickCapture={captureClick} onKeyDownCapture={pauseIntro}>{source ? (["front", "back"] as const).map(side => <StoreProductMockup key={side} sourceUrl={source} geometry={geometry} margins={margins} model={product.artworkOptions!.mockup} name={product.name} frame={frame} fixedSide={side} compact expandable/>) : <p className={styles.demoStatus}>Preparando sua prévia…</p>}</div>
      <p className={styles.demoDisclaimer}><Info size={15}/><span><strong>Simulação ilustrativa.</strong> Cores, curvatura e acabamento podem variar, principalmente no verso e no fecho. Confira a arte final na aprovação do seu produto.</span></p>
    </div>
    {libraryOpen && libraryEnabled ? <LibraryPicker slug={slug} preview={preview} productId={product.id} onClose={() => setLibraryOpen(false)} onSelect={asset => update({ backgroundType: "image", backgroundImage: { asset, scale: 1, offsetX: 0, offsetY: 0, fillColor: artwork.backgroundImage?.fillColor ?? "#ffffff" } })}/> : null}
  </div>;
}
