"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ImageIcon, X, XCircle } from "lucide-react";

export function PublicQuoteDecision({
  token,
  disabled,
  artworkReviewPending,
  requiresOtp,
  maskedEmail
}: {
  token: string;
  disabled: boolean;
  artworkReviewPending: boolean;
  requiresOtp: boolean;
  maskedEmail?: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"accepted" | "rejected" | "">("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [confirmArtwork, setConfirmArtwork] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  async function decide(decision: "accepted" | "rejected", acceptArtworkAsIs = false) {
    setLoading(decision);
    setMessage("");
    const response = await fetch(`/api/public/quotes/${token}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note, acceptArtworkAsIs, otpCode: requiresOtp ? otpCode : undefined })
    });
    setLoading("");

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.error ?? "Não foi possível registrar sua decisão.");
      return;
    }

    setDone(true);
    setConfirmArtwork(false);
    setMessage(decision === "accepted" ? "Orçamento aceito. Obrigado!" : "Orçamento recusado. Obrigado pelo retorno.");
    router.refresh();
  }

  if (disabled || done) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-sm font-medium text-white">{message || "Este orçamento já recebeu uma decisão."}</p>
      </div>
    );
  }

  function requestAcceptance() {
    if (artworkReviewPending) {
      setConfirmArtwork(true);
      return;
    }
    void decide("accepted");
  }

  function reviewArtwork() {
    setConfirmArtwork(false);
    document.getElementById("public-artwork-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
      <h2 className="text-base font-semibold text-white">Decisão do orçamento</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Confirme sua decisão abaixo. Se quiser, deixe uma observação para a equipe.
      </p>
      <textarea
        className="focus-ring mt-4 min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Observação opcional"
        value={note}
      />
      {requiresOtp ? (
        <div className="mt-4 rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3">
          <label className="text-xs font-medium text-cyan-100" htmlFor="public-quote-otp">Código de acesso enviado para {maskedEmail ?? "o e-mail cadastrado"}</label>
          <div className="mt-2 flex gap-2">
            <input
              className="focus-ring min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-base tracking-[0.3em] text-white"
              id="public-quote-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              value={otpCode}
            />
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-60"
              disabled={otpLoading}
              onClick={async () => {
                setOtpLoading(true);
                setMessage("");
                const response = await fetch(`/api/public/quotes/${token}/otp`, { method: "POST" });
                const data = await response.json().catch(() => null);
                setOtpLoading(false);
                setMessage(response.ok ? `Novo código enviado para ${data?.email ?? maskedEmail ?? "o e-mail cadastrado"}.` : data?.error ?? "Não foi possível reenviar o código.");
              }}
              type="button"
            >{otpLoading ? "Enviando..." : "Reenviar"}</button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300 disabled:opacity-60"
          disabled={Boolean(loading) || (requiresOtp && otpCode.length !== 6)}
          onClick={requestAcceptance}
          type="button"
        >
          <CheckCircle2 size={17} />
          {loading === "accepted" ? "Confirmando..." : "Aceitar orçamento"}
        </button>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-400/20 disabled:opacity-60"
          disabled={Boolean(loading) || (requiresOtp && otpCode.length !== 6)}
          onClick={() => void decide("rejected")}
          type="button"
        >
          <XCircle size={17} />
          {loading === "rejected" ? "Enviando..." : "Recusar"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
    </div>
    {confirmArtwork ? <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="artwork-confirm-title">
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-400/10 text-amber-300"><AlertTriangle size={19} /></span><div><h2 className="font-semibold text-white" id="artwork-confirm-title">Existem artes sem aprovação</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Você ainda não revisou e aprovou todas as artes deste orçamento.</p></div></div>
          <button aria-label="Fechar" className="focus-ring rounded-md p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" type="button" onClick={() => setConfirmArtwork(false)}><X size={18} /></button>
        </div>
        <div className="p-5"><p className="text-sm leading-6 text-zinc-300">Deseja aceitar o orçamento usando as artes exatamente como estão agora, sem concluir o reenquadramento e a seleção das versões?</p><p className="mt-3 rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200">Ao confirmar, a equipe receberá o aceite com a indicação de que as artes atuais foram aceitas sem revisão final.</p></div>
        <div className="grid gap-2 border-t border-zinc-800 p-4 sm:grid-cols-2">
          <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-violet-700 px-4 py-2.5 text-sm font-medium text-violet-200 hover:bg-violet-950/50" type="button" onClick={reviewArtwork}><ImageIcon size={16} /> Revisar e reenquadrar a(s) arte(s)</button>
          <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-60" disabled={Boolean(loading)} type="button" onClick={() => void decide("accepted", true)}><CheckCircle2 size={16} /> {loading === "accepted" ? "Confirmando..." : "Sim, aceitar como estão"}</button>
        </div>
      </div>
    </div> : null}
    </>
  );
}
