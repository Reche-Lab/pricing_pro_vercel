"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useId, useRef, useState } from "react";
import { ImageOff, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { LibraryCategory } from "@/domain/commerce/library";
import styles from "./library.module.css";

export function LibraryDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`${styles.dialog} ${wide ? styles.wideDialog : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className={styles.dialogHeader}>
        <h2 id={id}>{title}</h2>
        <button
          className={styles.iconButton}
          type="button"
          disabled={busy}
          onClick={onClose}
          title="Fechar"
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  );
}
export function LibraryPicture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={styles.picture}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={480}
          height={480}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.pictureFallback}>
          <ImageOff size={24} />
          <span>Prévia indisponível</span>
        </span>
      )}
    </div>
  );
}
export function LibraryCategoryOptions({
  categories,
}: {
  categories: LibraryCategory[];
}) {
  return (
    <>
      {categories
        .filter((item) => !item.parent_id)
        .map((parent) => (
          <React.Fragment key={parent.id}>
            <option value={parent.id}>{parent.name}</option>
            {categories
              .filter((child) => child.parent_id === parent.id)
              .map((child) => (
                <option key={child.id} value={child.id}>
                  {parent.name} / {child.name}
                </option>
              ))}
          </React.Fragment>
        ))}
    </>
  );
}
export function LibraryPagination({
  page,
  total,
  pageSize,
  onChange,
  loading,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  loading: boolean;
}) {
  return (
    <div className={styles.pagination}>
      <span>
        {total} {total === 1 ? "arte" : "artes"} · Página {page} de{" "}
        {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div>
        <button
          type="button"
          className={styles.iconButton}
          title="Página anterior"
          aria-label="Página anterior"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          title="Próxima página"
          aria-label="Próxima página"
          disabled={loading || page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
