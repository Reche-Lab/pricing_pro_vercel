"use client";
import React, { useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2 } from "lucide-react";
import type { LibraryArtwork } from "@/domain/commerce/library";
import type { StudioBackgroundAsset } from "@/domain/commerce/studio-background";
import { LibraryDialog, LibraryPicture } from "./LibraryUI";
import { LibraryGallery, libraryApi } from "./StoreLibrary";
import { loadStudioLibraryAsset } from "./studio-library";
import styles from "./library.module.css";
export function StudioLibraryPicker({ slug, preview, productId, onSelect, onClose }: { slug: string; preview: boolean; productId: string; onSelect: (asset: StudioBackgroundAsset) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<LibraryArtwork | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const working = useRef(false);
  return <LibraryDialog title="Artes prontas para sua criação" onClose={onClose} busy={busy} wide>
    {selected ? <>
      <button type="button" className={styles.button} disabled={busy} onClick={() => { setSelected(null); setError(""); }}><ArrowLeft size={16}/>Voltar à galeria</button>
      <div className={`${styles.inspector} mt-4`}><LibraryPicture src={`${libraryApi(slug, preview)}/thumbnail/${selected.id}?v=${selected.version}`} alt={selected.title}/><div><h3>{selected.title}</h3><p>{selected.description}</p>
        {!selected.editable ? <p className={styles.hint}>Esta arte não está liberada para edição no Estúdio. Escolha outra opção.</p> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.primary} disabled={busy || !selected.editable} onClick={async () => {
          if (working.current) return;
          working.current = true; setBusy(true); setError("");
          try { const asset = await loadStudioLibraryAsset(slug, preview, productId, selected.id); onSelect(asset); onClose(); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir esta arte. Tente novamente."); }
          finally { working.current = false; setBusy(false); }
        }}>{busy ? <Loader2 size={16} className="animate-spin"/> : <ImagePlus size={16}/>} {busy ? "Abrindo arte…" : "Usar como fundo"}</button>
      </div></div>
    </> : <LibraryGallery slug={slug} preview={preview} productId={productId} onInspect={setSelected}/>}
  </LibraryDialog>;
}
