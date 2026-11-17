"use client";
import React from "react";
import Link from "next/link";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { FileText, Images, Paintbrush } from "lucide-react";
import type { AssistantCard, AssistantArtworkBenefit } from "@/domain/commerce/assistant";
import { storeMoney } from "./store-http";
import styles from "./assistant.module.css";

export function AssistantArtworkBenefitNote({ benefit }: { benefit: AssistantArtworkBenefit }) {
  return <small>Até {benefit.percent.toLocaleString("pt-BR")}% extra preparando e aprovando sua arte na loja, limitado a {storeMoney(benefit.limitPerArtworkCents)} por arte/grupo.</small>;
}

export function StoreAssistantGuide({ card, base, onClose }: { card: Extract<AssistantCard, { kind: "guide" }>; base: string; onClose: () => void }) {
  const { topic, guide } = card;
  const features = guide?.features;
  const link = (path: string, label: React.ReactNode) => <Link className={styles.action} href={`${path.startsWith("?") ? base || "/" : base}${path}`} onClick={onClose}>{label}</Link>;
  if (topic === "policies") return <><strong>Condições da loja</strong><p>Confira as regras de compra, personalização e entrega. A equipe pode ajudar com dúvidas específicas.</p>{link("/condicoes", "Ler condições")}</>;
  return <>
    <strong>{topic === "artwork" ? "Sua arte, do envio à aprovação" : "Compre ou peça um orçamento"}</strong>
    {topic === "artwork" ? <>
      <p>{features?.personalized ? "Envie sua imagem no produto, retoque se precisar, enquadre e aprove antes da compra." : "Abra um produto para conferir as opções de personalização disponíveis."}</p>
      {features?.personalized ? <details className={styles.guideDetails}><summary>Como preparar a arte</summary><p>Mantenha textos e detalhes na segurança. A imagem fica visível até a sangria; continue o fundo até o corte para evitar bordas brancas.</p><p>Use zoom e deslocamento para enquadrar, ou retoque para completar o fundo. O guia SVG do produto tem as medidas reais; oculte suas linhas antes de exportar.</p>{features.teamPreparation ? <p>Prefere ajuda? Nos produtos que permitem, escolha que a equipe faça os ajustes finais, sem o benefício por arte pronta.</p> : null}</details> : null}
      <div className={styles.nextActions}>{features?.studio ? link("?estudio=1", <><Paintbrush size={16} aria-hidden="true"/>Criar minha arte</>) : null}{features?.library ? link("/artes", <><Images size={16} aria-hidden="true"/>Escolher arte pronta</>) : null}{link("/catalogo", "Escolher produto")}</div>
    </> : <>
      {features?.quotes ? <><p>Salve um orçamento em PDF sem comprar nem pagar. Você não precisa ter a arte pronta.</p><small>Valide seu e-mail e preencha os dados da pessoa ou empresa. O orçamento fica na sua conta para retomar depois; os valores serão conferidos antes da compra.</small>{link("/orcamento", <><FileText size={16} aria-hidden="true"/>Solicitar orçamento</>)}</> : <p>Escolha produtos e quantidades, revise o carrinho e preencha os dados antes do pagamento.</p>}
      <details className={styles.guideDetails}><summary>Compra e acompanhamento</summary><p>Confira o total, os dados de faturamento e o recebimento antes de pagar.</p>{features?.delivery ? <p>Consulte frete e prazo pelo CEP. Produção e transporte têm prazos separados; a estimativa não garante uma data.</p> : null}{features?.pickup ? <p>A loja também oferece retirada no local.</p> : null}{features?.orders ? link("/conta", "Minha conta: pedidos e orçamentos") : null}{link("/carrinho", "Revisar carrinho")}</details>
    </>}
    {guide?.benefits.length ? <>
      <strong className={styles.productHint}>Até {Math.max(...guide.benefits.map(benefit => benefit.percent)).toLocaleString("pt-BR")}% extra com arte pronta</strong>
      <small>Somente enviar a imagem não libera o benefício: prepare, enquadre e aprove na loja. Vale para produtos elegíveis, com limite por arte/grupo.</small>
      <details className={styles.guideDetails}><summary>Ver produtos e limites</summary>{guide.benefits.map(benefit => <p key={benefit.productId}><Link href={commerceProductPath(base, { id: benefit.productId, slug: benefit.slug })} onClick={onClose}>{benefit.name}</Link><AssistantArtworkBenefitNote benefit={benefit}/></p>)}{guide.moreBenefits ? <small>Consulte outros produtos no catálogo para conferir seus benefícios.</small> : null}</details>
    </> : null}
  </>;
}
