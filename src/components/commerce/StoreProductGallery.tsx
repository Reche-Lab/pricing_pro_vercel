"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import {
  getProductMedia,
  type ProductMedia,
} from "@/domain/commerce/product-media";
import styles from "./store.module.css";
export function StoreProductGallery({
  name,
  id,
  imageUrl,
  media,
}: {
  name: string;
  id: string;
  imageUrl: string;
  media?: ProductMedia[];
}) {
  const items = getProductMedia(media, imageUrl, id);
  const [selected, setSelected] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const thumbnails = useRef<HTMLDivElement>(null);
  const index = selected % Math.max(1, items.length);
  const active = items[index];
  function choose(next: number) {
    const target = (next + items.length) % items.length;
    setSelected(target);
    setPlaybackError(false);
    const container = thumbnails.current;
    const button = container?.children[target] as HTMLElement | undefined;
    if (container && button)
      container.scrollTo?.({
        left:
          button.offsetLeft -
          container.clientWidth / 2 +
          button.clientWidth / 2,
        behavior: "auto",
      });
  }
  if (!active) return null;
  return (
    <section
      className={styles.productGallery}
      aria-label={`Galeria: ${name}`}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLVideoElement) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          choose(index + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <div
        className={styles.galleryStage}
        onTouchStart={(event) => {
          if (active.kind !== "image") return;
          const first = event.touches[0];
          touch.current = { x: first.clientX, y: first.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          const end = event.changedTouches[0];
          if (
            active.kind === "image" &&
            start &&
            Math.abs(end.clientX - start.x) > 50 &&
            Math.abs(end.clientY - start.y) < 60
          )
            choose(index + (end.clientX < start.x ? 1 : -1));
          touch.current = null;
        }}
      >
        {active.kind === "video" ? (
          <video
            key={active.id}
            src={active.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`Vídeo de ${name}`}
            onError={() => setPlaybackError(true)}
          />
        ) : (
          <img
            key={active.id}
            src={active.url}
            alt={`${name} - imagem ${index + 1}`}
            width={1200}
            height={1200}
          />
        )}
      </div>
      {playbackError ? (
        <p role="alert" className={styles.muted}>
          Este navegador não conseguiu reproduzir o vídeo.{" "}
          <a
            className="underline"
            href={active.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir arquivo do vídeo
          </a>
        </p>
      ) : null}
      {items.length > 1 ? (
        <>
          <div className={styles.galleryNavigation}>
            <span aria-live="polite">
              {active.kind === "video" ? "Vídeo" : "Imagem"} {index + 1} de{" "}
              {items.length}
            </span>
            <div>
              <button
                type="button"
                className={styles.iconButton}
                title="Mídia anterior"
                aria-label="Mídia anterior"
                onClick={() => choose(index - 1)}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                title="Próxima mídia"
                aria-label="Próxima mídia"
                onClick={() => choose(index + 1)}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
          <div
            ref={thumbnails}
            className={styles.galleryThumbnails}
            aria-label="Miniaturas do produto"
          >
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.kind === "video" ? "Ver vídeo" : "Ver imagem"} ${i + 1}`}
                aria-pressed={i === index}
                onClick={() => choose(i)}
              >
                {item.kind === "image" ? (
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    width={76}
                    height={76}
                  />
                ) : (
                  <span>
                    <Play size={22} />
                    <small>Vídeo</small>
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
