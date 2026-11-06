import React from "react";
import type { CommerceAddress, CommerceBillingSnapshot } from "@/domain/commerce/schemas";
import { formatCheckoutDocument, formatCheckoutPhone } from "@/domain/commerce/checkout";
import { formatCep } from "@/lib/cep";

function PostalAddress({ address }: { address: CommerceAddress | Omit<CommerceAddress, "attention"> }) {
  return <address className="text-sm not-italic leading-6">
    {address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ""}<br/>
    {address.district} · {address.city}/{address.state} · {formatCep(address.postalCode)}
  </address>;
}
export function StoreOrderContactDetails({ billing, address, same = false }: {
  billing?: CommerceBillingSnapshot | null; address: CommerceAddress | null; same?: boolean;
}) {
  return <div className="mt-5 min-w-0 space-y-4 border-t border-current/15 pt-4">
    {billing ? <section aria-label="Dados de faturamento do pedido" className="space-y-1 text-sm">
      <h2 className="font-semibold">Faturamento</h2>
      <p className="break-words">{billing.name}</p>
      <p>{billing.personType === "J" ? "CNPJ" : "CPF"}: {formatCheckoutDocument(billing.document)}</p>
      <p className="break-all">{billing.email}</p><p>{formatCheckoutPhone(billing.phone)}</p>
      <PostalAddress address={billing}/>
    </section> : null}
    <section aria-label="Dados de entrega do pedido" className="space-y-1 text-sm">
      <h2 className="font-semibold">Recebimento</h2>
      {address ? <>
        {same && billing ? <p>Mesmo destinatário e endereço do faturamento.</p> : <><p className="break-words">{address.name}</p><p>{formatCheckoutPhone(address.phone)}</p><PostalAddress address={address}/></>}
        {address.attention ? <p>Aos cuidados de {address.attention}</p> : null}
      </> : <p>Retirada pessoalmente.</p>}
    </section>
  </div>;
}
