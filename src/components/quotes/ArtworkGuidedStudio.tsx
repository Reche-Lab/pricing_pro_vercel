"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ArrowLeft, Check, Crop, Paintbrush, X } from "lucide-react";
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
  onApprove: (asset: ArtworkStudioAsset) => Promise<void>;
  onClose: () => void;
}) {
  const [asset, setAsset] = useState(initialAsset);
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [complete, setComplete] = useState(false);
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
  }
  const navigation = (
    <ol
      aria-label="Etapas da arte"
      className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
    >
      {(["retouch", "crop", "review"] as const).map((value, index) => (
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
              : "Aprovar"}
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
            // Retouch exports an extended canvas: previous crop coordinates cannot be reused safely.
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
          }}
          geometry={asset.geometry}
          {...asset.margins}
          imageUrl={asset.sourceUrl}
          itemId=""
          quoteId=""
          navigation={navigation}
          onRetouch={() => navigate("retouch")}
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
                  {complete ? "Arte aprovada" : "Revisar e aprovar"}
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
              {complete ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-emerald-300"
                >
                  <Check size={20} /> Esta versão está aprovada.
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
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await onApprove(asset);
                        setAsset({ ...asset, approved: true });
                        setComplete(true);
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Não foi possível aprovar.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Check size={16} /> {busy ? "Aprovando..." : "Aprovar arte"}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}
