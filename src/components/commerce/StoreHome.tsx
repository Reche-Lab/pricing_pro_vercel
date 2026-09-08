"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Layers3,
  Paintbrush,
  Pause,
  Play,
  Store,
} from "lucide-react";
import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { storeMoney } from "./store-http";
import styles from "./store.module.css";
export type StoreProduct = ReturnType<typeof publicCommerceProduct>;

export function StoreProductCard({
  product,
  base,
}: {
  product: StoreProduct;
  base: string;
}) {
  return (
    <Link className={styles.product} href={`${base}/produto/${product.id}`}>
      <div className={styles.productPhoto}>
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          width={400}
          height={400}
        />
        {product.personalized ? (
          <span className={styles.productTag}>
            <Paintbrush size={12} /> Personalizável
          </span>
        ) : null}
        <span className={styles.productArrow}>
          <ArrowRight size={18} />
        </span>
      </div>
      <p className={styles.productCategory}>{product.category}</p>
      <h3>{product.name}</h3>
      {product.offer.originalUnitCents > product.unitCents ? <del className={styles.referencePrice} aria-label="Preço de uma unidade">{storeMoney(product.offer.originalUnitCents)}</del> : null}
      <p className={styles.priceLine}>
        {storeMoney(product.unitCents)} <span>/ un.</span>
      </p>
      <p className={styles.muted}>
        em {product.minQuantity}{" "}
        {product.minQuantity === 1 ? "unidade" : "unidades"}
      </p>
      {product.offer.maxDiscountPercent > 0 ? <p className={styles.discountBadge}
        title={`Desconto de ${product.offer.maxDiscountPercent}% em ${product.offer.discountQuantity} unidades${product.personalized ? " com uma arte" : ""}, em relação ao preço de uma unidade.`}>
        Até {product.offer.maxDiscountPercent}% de desconto
        <small>em {product.offer.discountQuantity.toLocaleString("pt-BR")} un.{product.personalized ? " · 1 arte" : ""}</small>
      </p> : null}
    </Link>
  );
}

export function ProductCarousel({
  products,
  base,
  title,
  category,
}: {
  products: StoreProduct[];
  base: string;
  title: string;
  category?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const update = () =>
      setEnds({
        start: node.scrollLeft <= 2,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2,
      });
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [products]);
  function move(direction: number) {
    const node = rail.current;
    if (node)
      node.scrollBy({
        left: direction * node.clientWidth * 0.85,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }
  return (
    <section className={styles.collection} aria-label={title}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>FEITO PARA A SUA IDEIA</p>
          <h2>{title}</h2>
        </div>
        <div className={styles.railActions}>
          <Link
            href={`${base}/catalogo${category ? `?categoria=${encodeURIComponent(category)}` : ""}`}
          >
            Ver todos <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            className={styles.iconButton}
            disabled={ends.start}
            title={`Produtos anteriores: ${title}`}
            aria-label={`Produtos anteriores: ${title}`}
            onClick={() => move(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            disabled={ends.end}
            title={`Próximos produtos: ${title}`}
            aria-label={`Próximos produtos: ${title}`}
            onClick={() => move(1)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <div
        ref={rail}
        className={styles.productRail}
        tabIndex={0}
        aria-label={`Produtos: ${title}`}
      >
        {products.map((product) => (
          <StoreProductCard key={product.id} product={product} base={base} />
        ))}
      </div>
    </section>
  );
}

export function BannerCarousel({
  settings,
  base,
}: {
  settings: StoreSettings;
  base: string;
}) {
  const slides = settings.banners?.length
    ? settings.banners
    : settings.bannerUrl
      ? [
          {
            id: "cover",
            imageUrl: settings.bannerUrl,
            mobileImageUrl: "",
            showText: true,
            title: "",
            description: settings.description,
            buttonLabel: "Escolher meus produtos",
            category: "",
          },
        ]
      : [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!window.matchMedia) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPlaying(!motion.matches);
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing || interacting || !visible || slides.length < 2) return;
    const timer = setInterval(
      () => setIndex((old) => (old + 1) % slides.length),
      6500,
    );
    return () => clearInterval(timer);
  }, [playing, interacting, visible, slides.length]);
  const current = index % Math.max(slides.length, 1);
  function move(direction: number) {
    setIndex((old) => (old + direction + slides.length) % slides.length);
  }
  if (!slides.length)
    return (
      <section className={styles.homeIntro}>
        <p className={styles.eyebrow}>IDEIAS QUE GANHAM FORMA</p>
        <h1>{settings.name}</h1>
        <p>{settings.description}</p>
        <Link className={styles.primary} href={`${base}/catalogo`}>
          Explorar produtos <ArrowRight size={18} />
        </Link>
      </section>
    );
  return (
    <section
      className={`${styles.hero} ${slides[current].showText === false ? styles.imageOnlyHero : ""}`}
      aria-label="Destaques da loja"
      aria-roledescription="carrossel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setInteracting(false);
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const from = touchStart.current;
        const to = event.changedTouches[0];
        if (
          from &&
          Math.abs(to.clientX - from.x) > 50 &&
          Math.abs(to.clientY - from.y) < 60
        )
          move(to.clientX < from.x ? 1 : -1);
        touchStart.current = null;
      }}
    >
      {slides.map((slide, i) => (
        <picture
          key={slide.id}
          className={styles.heroPicture}
          hidden={i !== current}
        >
          {slide.mobileImageUrl ? (
            <source media="(max-width: 600px)" srcSet={slide.mobileImageUrl} />
          ) : null}
          <img
            src={slide.imageUrl}
            alt={slide.title || `Produtos de ${settings.name}`}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
          />
        </picture>
      ))}
      {slides[current].showText === false ? (
        <>
          <h1 className="sr-only">{settings.name}</h1>
          <Link
            className={styles.bannerImageLink}
            aria-label={
              slides[current].buttonLabel ||
              slides[current].title ||
              "Conhecer produtos"
            }
            href={`${base}/catalogo${slides[current].category ? `?categoria=${encodeURIComponent(slides[current].category)}` : ""}`}
          />
        </>
      ) : (
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>SUA IDEIA. SEU ESTILO.</p>
          <h1>{settings.name}</h1>
          <div
            className={styles.heroCopy}
            aria-live={playing ? "off" : "polite"}
          >
            {slides[current].title ? <h2>{slides[current].title}</h2> : null}
            <p>{slides[current].description || settings.description}</p>
          </div>
          <Link
            className={styles.heroCta}
            href={`${base}/catalogo${slides[current].category ? `?categoria=${encodeURIComponent(slides[current].category)}` : ""}`}
          >
            {slides[current].buttonLabel || "Conhecer produtos"}
            <ArrowRight size={18} />
          </Link>
        </div>
      )}
      {slides.length > 1 ? (
        <div className={styles.bannerControls}>
          <div className={styles.bannerDots}>
            {slides.map((slide, i) => (
              <button
                type="button"
                key={slide.id}
                onClick={() => setIndex(i)}
                aria-label={`Mostrar banner ${i + 1}`}
                aria-pressed={current === i}
              >
                <span />
              </button>
            ))}
          </div>
          <span className={styles.slideCount}>
            {String(current + 1).padStart(2, "0")} /{" "}
            {String(slides.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            title={playing ? "Pausar banners" : "Reproduzir banners"}
            aria-label={playing ? "Pausar banners" : "Reproduzir banners"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            title="Banner anterior"
            aria-label="Banner anterior"
            onClick={() => move(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            title="Próximo banner"
            aria-label="Próximo banner"
            onClick={() => move(1)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function StoreHome({
  settings,
  products,
  base,
}: {
  settings: StoreSettings;
  products: StoreProduct[];
  base: string;
}) {
  const categories = [...new Set(products.map((p) => p.category))];
  const personalized = products.some((p) => p.personalized);
  return (
    <>
      <BannerCarousel settings={settings} base={base} />
      {personalized ? (
        <div className={styles.benefits}>
          <div>
            <Paintbrush size={22} />
            <span>
              <strong>Do seu jeito</strong>
              <small>Envie sua própria arte</small>
            </span>
          </div>
          <div>
            <Layers3 size={22} />
            <span>
              <strong>Uma ideia ou várias</strong>
              <small>Combine quantidades e artes</small>
            </span>
          </div>
          <div>
            <CheckCheck size={22} />
            <span>
              <strong>Você aprova primeiro</strong>
              <small>Confira a arte antes de comprar</small>
            </span>
          </div>
          {settings.pickupEnabled ? (
            <div>
              <Store size={22} />
              <span>
                <strong>Retire com a gente</strong>
                <small>Retirada disponível no checkout</small>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.homeContent}>
        {products.length ? (
          <ProductCarousel
            products={products}
            base={base}
            title="Encontre o seu próximo favorito"
          />
        ) : (
          <section className={styles.collection}>
            <h2>Novidades em breve</h2>
            <p className={styles.muted}>
              Estamos preparando os produtos desta loja.
            </p>
          </section>
        )}
        {categories.length > 1 ? (
          <section className={styles.categorySection} aria-label="Coleções">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>
                  ENCONTRE O QUE COMBINA COM VOCÊ
                </p>
                <h2>Explore por categoria</h2>
              </div>
            </div>
            <div className={styles.categoryRail}>
              {categories.map((category) => (
                <Link
                  key={category}
                  href={`${base}/catalogo?categoria=${encodeURIComponent(category)}`}
                >
                  <img
                    src={
                      products.find((p) => p.category === category)!.imageUrl
                    }
                    alt=""
                    loading="lazy"
                    width={96}
                    height={96}
                  />
                  <span>{category}</span>
                  <ArrowRight size={18} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {categories.length > 1 ? (
          <ProductCarousel
            products={products.filter((p) => p.category === categories[0])}
            base={base}
            title={categories[0]}
            category={categories[0]}
          />
        ) : null}
      </div>
    </>
  );
}
