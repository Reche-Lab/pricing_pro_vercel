"use client";
import React, { useState, type FormEvent } from "react";
import { storeRequest } from "./store-http";
import styles from "./store.module.css";
export function BuyerLogin({
  api,
  onLogged,
  disabled,
  forQuote = false,
}: {
  api: string;
  onLogged: () => Promise<void>;
  disabled: boolean;
  forQuote?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await storeRequest(`${api}/auth`, "POST", {
          action: "verify",
          challengeId: challenge,
          code,
        });
        await onLogged();
      } else {
        const result = await storeRequest(`${api}/auth`, "POST", {
          action: "request",
          name,
          email,
        });
        setChallenge(result.challengeId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={`${styles.form} mx-auto max-w-md py-8`}>
      <h2 className={styles.title}>
        {challenge ? "Confira seu e-mail" : forQuote ? "Valide seu e-mail para salvar o orçamento" : "Entre ou crie sua conta"}
      </h2>
      <p className={styles.muted}>
        {challenge
          ? `Enviamos um código para ${email}. Ele é válido por 10 minutos.`
          : forQuote ? "Seus produtos continuam no rascunho. Receba um código por e-mail, sem senha, para guardar o orçamento na sua conta e comprar depois." : "Acesse com um código por e-mail, sem precisar criar uma senha."}
      </p>
      {!challenge ? (
        <>
          <label>
            Seu nome
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </label>
        </>
      ) : (
        <label>
          Código de acesso
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            pattern="[0-9]{6}"
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button className={styles.primary} disabled={busy || disabled}>
        {busy ? "Aguarde…" : challenge ? forQuote ? "Validar e continuar orçamento" : "Confirmar acesso" : "Receber código"}
      </button>
      {challenge ? (
        <button
          type="button"
          className="text-sm underline"
          disabled={busy}
          onClick={() => {
            setChallenge("");
            setCode("");
          }}
        >
          Trocar e-mail ou solicitar outro código
        </button>
      ) : null}
    </form>
  );
}
