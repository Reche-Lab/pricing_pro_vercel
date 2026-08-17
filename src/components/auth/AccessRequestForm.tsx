"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, CheckCircle2 } from "lucide-react";

export function AccessRequestForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ message: string; verificationUrl?: string; statusUrl?: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true);
    setError("");
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        email: form.get("email"),
        whatsapp: form.get("whatsapp"),
        companyName: form.get("companyName"),
        businessSegment: form.get("businessSegment"),
        intendedUse: form.get("intendedUse"),
        privacyAccepted: form.get("privacyAccepted") === "on",
        website: form.get("website")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Não foi possível enviar a solicitação.");
      return;
    }
    formElement.reset();
    setSuccess(data);
  }

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-5">
        <CheckCircle2 className="text-emerald-300" size={28} />
        <h2 className="mt-3 text-lg font-semibold text-white">Solicitação recebida</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{success.message} Verifique também a caixa de spam.</p>
        {success.verificationUrl ? (
          <div className="mt-4 rounded-md border border-amber-400/20 bg-zinc-950/60 p-3 text-xs text-zinc-400">
            SMTP não é obrigatório no ambiente local. <Link className="font-semibold text-amber-300" href={success.verificationUrl}>Confirmar e-mail agora</Link>
          </div>
        ) : null}
        <Link className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white" href="/login">
          Voltar ao login <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nome completo" name="fullName" required />
        <Input label="E-mail profissional" name="email" required type="email" />
        <Input label="WhatsApp" name="whatsapp" placeholder="(12) 99999-9999" required type="tel" />
        <Input label="Empresa" name="companyName" required />
      </div>
      <Input label="Segmento" name="businessSegment" placeholder="Ex.: personalizados, gráfica, brindes" />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">Como pretende utilizar o Pricing Pro?</span>
        <textarea className="focus-ring min-h-24 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm" maxLength={1000} name="intendedUse" />
      </label>
      <input aria-hidden className="hidden" name="website" tabIndex={-1} />
      <label className="flex cursor-pointer gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm leading-5 text-zinc-300">
        <input className="mt-0.5 size-4 accent-amber-400" name="privacyAccepted" required type="checkbox" />
        <span>Autorizo o uso destes dados para análise da solicitação, contato e criação da conta, conforme o <Link className="font-semibold text-amber-300 hover:text-amber-200" href="/privacy" target="_blank">aviso de privacidade</Link>.</span>
      </label>
      {error ? <p className="rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-3 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60" disabled={loading} type="submit">
        <Building2 size={17} /> {loading ? "Enviando..." : "Solicitar acesso para minha empresa"}
      </button>
    </form>
  );
}

function Input({ label, name, placeholder, required = false, type = "text" }: { label: string; name: string; placeholder?: string; required?: boolean; type?: string }) {
  return <label className="block min-w-0"><span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span><input className="focus-ring w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2" maxLength={180} name={name} placeholder={placeholder} required={required} type={type} /></label>;
}
