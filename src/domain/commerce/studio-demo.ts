import type { StudioArtwork } from "./studio-artwork";

export const studioInitialArtwork = (): StudioArtwork => ({ text: "Sua ideia\nganha forma", mode: "centered", font: "modern", textColor: "#ffffff", colors: ["#226d5c"], gradient: "solid" });
export const STUDIO_DEMO_STEPS: { title: string; tab: "text" | "background"; artwork: Partial<StudioArtwork> }[] = [
  { title: "Uma mensagem cheia de possibilidades", tab: "text", artwork: { text: "Pequenas ideias, grandes histórias. Crie algo que seja só seu.", mode: "centered" } },
  { title: "Sua mensagem em círculo", tab: "text", artwork: { mode: "circle" } },
  { title: "Palavras que ganham uma espiral", tab: "text", artwork: { mode: "spiral" } },
  { title: "Três cores para combinar", tab: "background", artwork: { backgroundType: "color", colors: ["#226d5c", "#a52e48", "#244f83"], gradient: "horizontal" } },
  { title: "E um fundo em espiral", tab: "background", artwork: { gradient: "spiral" } },
];
