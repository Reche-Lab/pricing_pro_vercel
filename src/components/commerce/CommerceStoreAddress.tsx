"use client";
import React from "react";
import { CommerceDomainSetup } from "./CommerceDomainSetup";
import type { getCommerceAdmin } from "@/repositories/commerce";

export function CommerceStoreAddress({ slug, urls, value, onChange, disabled }: {
  slug?: string; urls?: Awaited<ReturnType<typeof getCommerceAdmin>>["urls"]; value: string;
  onChange: (value: string) => void; disabled: boolean;
}) {
  return <section className="max-w-4xl min-w-0 space-y-5">
    <h2 className="font-semibold">Domínio e DNS da loja</h2>
    <div className="space-y-2 border-l-2 border-emerald-500/40 pl-3"><p className="text-xs text-zinc-400">URL principal configurada</p><a className="block break-all text-sm text-emerald-300 underline" target="_blank" rel="noopener noreferrer" href={urls?.public ?? `/loja/${slug}`}>{urls?.public ?? `/loja/${slug}`}</a><p className="text-xs text-zinc-400">A URL só aceita compras quando a loja estiver habilitada e publicada.</p></div>
    <p className="text-xs leading-5 text-zinc-400">Salvar registra o domínio desejado, mas não altera DNS nem comprova sua propriedade. A administração da plataforma deve adicioná-lo ao projeto Vercel, conferir os registros DNS e autorizar o vínculo com este tenant.</p>
    {urls?.domains.length ? <p className="break-words text-sm text-emerald-300">Vínculos autorizados na aplicação: {urls.domains.join(", ")}. Confira também DNS e HTTPS no Vercel.</p> : <p className="text-sm text-amber-200">Nenhum domínio próprio autorizado. A loja pode operar primeiro pela URL da plataforma.</p>}
    <CommerceDomainSetup hostname={value} onHostnameChange={onChange} disabled={disabled}/>
    <details className="border-t border-zinc-800 pt-4"><summary className="cursor-pointer text-sm">Etapas de ativação do domínio</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-400"><li>Homologue compra, frete, acesso por e-mail e webhook pela URL da plataforma.</li><li>Adicione o domínio e o www em Vercel → Settings → Domains. Use os valores DNS exatos indicados para o projeto, preservando MX/TXT de e-mail.</li><li>Depois da verificação, a administração configura <code>COMMERCE_CUSTOM_DOMAINS</code> no deploy, vinculando cada hostname ao slug deste tenant: <strong>{slug}</strong>.</li><li>Mantenha <code>APP_URL</code> no domínio do painel. O retorno de pagamento usa o domínio da loja e o webhook permanece no painel.</li><li>Confira HTTPS, páginas, carrinho, pagamento e sitemap antes de divulgar a nova URL.</li></ol></details>
  </section>;
}
