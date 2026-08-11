"use client";

import { ImagePlus } from "lucide-react";

export function PublicArtworkShortcut({ itemId, hasArtwork, disabled }: { itemId: string; hasArtwork: boolean; disabled: boolean }) {
  function openStudio() {
    window.dispatchEvent(new CustomEvent("public-artwork-select", { detail: { itemId } }));
    document.getElementById("public-artwork-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-400/10 px-2.5 py-1.5 text-xs font-medium text-violet-100 transition-colors hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
      disabled={disabled}
      type="button"
      onClick={openStudio}
    >
      <ImagePlus size={14} />
      {hasArtwork ? "Incluir ou substituir arte" : "Incluir arte"}
    </button>
  );
}
