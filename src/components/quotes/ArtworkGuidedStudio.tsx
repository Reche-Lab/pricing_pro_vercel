"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ArrowLeft, Check, Crop, Paintbrush, X } from "lucide-react";
import { inspectArtworkCoverage } from "./artwork-coverage";
import type { RetouchedArtworkFile } from "./ArtworkRetouchEditor";
import type {
  ArtworkStudioAsset,
  ArtworkStudioCrop,
  ArtworkStudioStep,
} from "./artwork-studio-types";
const CropEditor = dynamic(
  () => import("./ArtworkCropEditor").then((m) => m.ArtworkCropEditor),
  { ssr: false },
);
const RetouchEditor = dynamic(
  () => import("./ArtworkRetouchEditor").then((m) => m.ArtworkRetouchEditor),
  { ssr: false },
);

export function ArtworkGuidedStudio({
  initialAsset,
  initialStep = "crop",
  onRetouch,
  onPrepare,
  onApprove,
  onClose,
  renderProductPreview,
  renderFramingPreview,
  renderApprovalSuccess,
  proofMode = false,
  allowRetouch = true,
}: {
  initialAsset: ArtworkStudioAsset;
  initialStep?: ArtworkStudioStep;
  onRetouch: (
    asset: ArtworkStudioAsset,
    file: RetouchedArtworkFile,
  ) => Promise<ArtworkStudioAsset>;
  onPrepare: (
    asset: ArtworkStudioAsset,
    crop: ArtworkStudioCrop,
  ) => Promise<ArtworkStudioAsset>;
  onApprove: (asset: ArtworkStudioAsset, confirmation?: { acceptUncovered: boolean }) => Promise<void>;
  onClose: () => void;
  renderProductPreview?: (asset: ArtworkStudioAsset) => React.ReactNode;
  renderFramingPreview?: (asset: ArtworkStudioAsset, frame: ArtworkStudioCrop) => React.ReactNode;
  renderApprovalSuccess?: (asset: ArtworkStudioAsset) => React.ReactNode;
  proofMode?: boolean;
  allowRetouch?: boolean;
}) {
  const [asset, setAsset] = useState(initialAsset);
  const [step, setStep] = useState(initialStep === "retouch" && !allowRetouch ? "crop" : initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [coveragePrompt, setCoveragePrompt] = useState<{ uncoveredPercent: number } | null>(null);
  const [completeBackground, setCompleteBackground] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pendingRetouch = useRef<ArtworkStudioAsset | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && !element.contains(root.current),
    );
    const inertValues = siblings.map((element) => element.inert);
    const hiddenValues = siblings.map((element) => element.getAttribute("aria-hidden"));
    siblings.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    root.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      siblings.forEach((element, index) => {
        element.inert = inertValues[index];
        const hidden = hiddenValues[index];
        if (hidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", hidden);
      });
      previous?.focus();
    };
  }, []);
  function navigate(next: ArtworkStudioStep) {
    setStep(next);
    setError("");
    setAccepted(false);
    setImageReady(false);
    setCoveragePrompt(null);
  }
  async function approve(acceptUncovered = false) {
    setBusy(true); setError("");
    try {
      if (!proofMode && !acceptUncovered) {
        const coverage = await inspectArtworkCoverage(asset);
        if (coverage.warning) { setCoveragePrompt(coverage); return; }
      }
      await onApprove(asset, { acceptUncovered });
      setAsset({ ...asset, approved: true }); setComplete(true); setCoveragePrompt(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível aprovar."); }
    finally { setBusy(false); }
  }
  const navigation = (
    <ol
      aria-label="Etapas da arte"
      className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
    >
      {(["retouch", "crop", "review"] as const).filter(value => allowRetouch || value !== "retouch").map((value, index) => (
        <li
          key={value}
          aria-current={step === value ? "step" : undefined}
          className={`inline-flex items-center gap-1.5 ${step === value ? "font-semibold text-cyan-300" : "text-zinc-500"}`}
        >
          {value === "retouch" ? (
            <Paintbrush size={13} />
          ) : value === "crop" ? (
            <Crop size={13} />
          ) : (
            <Check size={13} />
          )}
          {index + 1}.{" "}
          {value === "retouch"
            ? "Retocar (opcional)"
            : value === "crop"
              ? "Enquadrar"
              : proofMode ? "Publicar prova" : "Aprovar"}
        </li>
      ))}
    </ol>
  );
  return createPortal(
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Estúdio da arte: ${asset.name}`}
      className="fixed inset-0 z-[110] outline-none"
      onKeyDownCapture={(event) => {
        if (event.key !== "Tab") return;
        const boundary =
          root.current?.querySelector('[role="alertdialog"]') ?? root.current;
        const buttons = Array.from(
          boundary?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = buttons[0],
          last = buttons.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !buttons.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !buttons.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {step === "retouch" ? (
        <RetouchEditor
          key={asset.id}
          artworkName={asset.name}
          fileName={asset.fileName}
          imageUrl={asset.sourceUrl}
          initialCrop={asset.crop}
          initialBackground={completeBackground}
          geometry={asset.geometry}
          {...asset.margins}
          draftUrl={asset.draftUrl}
          navigation={navigation}
          onContinue={() => {
            if (pendingRetouch.current) {
              setAsset(pendingRetouch.current);
              pendingRetouch.current = null;
            }
            navigate("crop");
          }}
          onClose={onClose}
          onSave={async (file) => {
            const next = await onRetouch(asset, file);
            // The exported image already includes its base framing; applying it again would shift the art.
            pendingRetouch.current = {
              ...next,
              approved: false,
              preparedUrl: undefined,
              crop: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 },
            };
          }}
        />
      ) : step === "crop" && asset.geometry ? (
        <CropEditor
          key={asset.id}
          artwork={{
            id: asset.id,
            artwork_name: asset.name,
            file_name: asset.fileName,
            crop_scale: String(asset.crop.scale),
            crop_offset_x: String(asset.crop.offsetX),
            crop_offset_y: String(asset.crop.offsetY),
            rotation_degrees: String(asset.crop.rotationDegrees),
            crop_background_color: asset.crop.backgroundColor,
          }}
          geometry={asset.geometry}
          {...asset.margins}
          imageUrl={asset.sourceUrl}
          itemId=""
          quoteId=""
          focusBackground={completeBackground}
          navigation={navigation}
          onRetouch={allowRetouch ? () => navigate("retouch") : undefined}
          renderPreview={renderFramingPreview ? frame => renderFramingPreview(asset, frame) : undefined}
          onPrepare={async (crop) => {
            const next = await onPrepare(asset, crop);
            setAsset({ ...next, crop, approved: false });
          }}
          onClose={onClose}
          onSaved={() => navigate("review")}
        />
      ) : (
        <div className="fixed inset-0 grid place-items-center overflow-hidden bg-black/85 p-0 sm:p-4">
          <section className="flex h-dvh w-full max-w-3xl flex-col overflow-hidden border border-zinc-700 bg-zinc-950 text-zinc-200 sm:h-auto sm:max-h-[94dvh] sm:rounded-lg">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 p-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-white">
                  {proofMode ? complete ? "Prova disponível para o cliente" : "Revisar prova" : complete ? "Arte aprovada" : "Revisar e aprovar"}
                </h2>
                <p className="mt-1 break-words text-xs text-zinc-400">
                  {asset.name}
                </p>
                {navigation}
              </div>
              <button
                aria-label="Fechar estúdio"
                disabled={busy}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-zinc-800"
                type="button"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {asset.preparedUrl && renderProductPreview ? renderProductPreview(asset) : null}
              {asset.preparedUrl ? (
                <img
                  key={asset.preparedUrl}
                  alt="Arte final para aprovação"
                  src={asset.preparedUrl}
                  className="mx-auto max-h-[42dvh] w-full rounded-md bg-white object-contain"
                  onLoad={() => setImageReady(true)}
                  onError={() => {
                    setImageReady(false);
                    setError(
                      "Não foi possível carregar a arte final. Volte ao enquadramento e tente novamente.",
                    );
                  }}
                />
              ) : (
                <p className="text-sm text-amber-300">
                  {asset.geometry
                    ? "Prepare o enquadramento antes de aprovar."
                    : "Este produto precisa ter as medidas de corte configuradas antes de prosseguir."}
                </p>
              )}
              {asset.notes ? (
                <p className="text-sm text-amber-200">{asset.notes}</p>
              ) : null}
              {complete ? renderApprovalSuccess ? renderApprovalSuccess(asset) : (
                <p
                  role="status"
                  className="flex items-center gap-2 text-emerald-300"
                >
                  <Check size={20} /> {proofMode ? "Esta prova aguarda a aprovação do cliente." : "Esta versão está aprovada."}
                </p>
              ) : (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
                    type="checkbox"
                    disabled={!asset.preparedUrl || busy || !imageReady}
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span>
                    Conferi os textos, as cores e o enquadramento desta versão.
                  </span>
                </label>
              )}
              {error ? (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              ) : null}
            </div>
            <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:p-4">
              {complete ? (
                <button
                  className="col-span-2 min-h-11 rounded-md bg-cyan-400 px-4 py-2 font-semibold text-cyan-950"
                  type="button"
                  onClick={onClose}
                >
                  Concluir
                </button>
              ) : (
                <>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      navigate(asset.geometry ? "crop" : "retouch")
                    }
                  >
                    <ArrowLeft size={16} />{" "}
                    {asset.geometry ? "Enquadrar" : "Retocar"}
                  </button>
                  <button
                    disabled={
                      busy || !accepted || !imageReady || !asset.preparedUrl
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-40"
                    type="button"
                    onClick={() => void approve()}
                  >
                    <Check size={16} /> {proofMode ? busy ? "Publicando..." : "Publicar prova na conta do cliente" : busy ? "Aprovando..." : "Aprovar arte"}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}
      {coveragePrompt ? <div className="fixed inset-0 z-[160] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="coverage-warning-title" className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-lg border border-amber-400/35 bg-zinc-950 p-5 text-zinc-200 shadow-2xl">
        <h2 id="coverage-warning-title" className="font-semibold text-amber-200">Há áreas sem cobertura na arte</h2>
        <p className="mt-3 text-sm leading-6">Identificamos aproximadamente {coveragePrompt.uncoveredPercent.toLocaleString("pt-BR")}% da área de corte sem imagem. Essas regiões serão brancas e podem aparecer na frente ou nas bordas e no verso do produto.</p>
        <p className="mt-2 text-xs leading-5 text-zinc-400">O fundo precisa continuar até o corte. Branco já presente na imagem pode ser intencional e não é tratado como falha nesta verificação. Confira também a simulação.</p>
        <div className="mt-5 grid gap-2"><button autoFocus type="button" disabled={busy} className="min-h-11 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-cyan-950" onClick={() => { setCompleteBackground(true); navigate("crop"); }}>Completar bordas no enquadramento</button>{allowRetouch ? <button type="button" disabled={busy} className="min-h-11 rounded-md border border-zinc-700 px-4 text-sm" onClick={() => { setCompleteBackground(true); navigate("retouch"); }}>Retocar e completar o fundo</button> : null}<button type="button" disabled={busy} className="min-h-11 rounded-md border border-zinc-700 px-4 text-sm" onClick={() => void approve(true)}>{busy ? "Aprovando…" : "Conferi e aprovo assim mesmo"}</button><button type="button" disabled={busy} className="min-h-10 text-sm text-zinc-400" onClick={() => setCoveragePrompt(null)}>Voltar à revisão</button></div>
      </section></div> : null}
    </div>,
    document.body,
  );
}
