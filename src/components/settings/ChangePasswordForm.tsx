"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export function ChangePasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setError("");
    setLoading(true);

    const response = await fetch("/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
        confirmPassword: form.get("confirmPassword")
      })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(response.status === 401 ? "Senha atual invalida." : "Nao foi possivel alterar a senha.");
      return;
    }

    formElement.reset();
    setMessage("Senha alterada com sucesso.");
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-5 flex items-center gap-2">
        <KeyRound className="text-amber-400" size={18} />
        <h2 className="font-semibold text-white">Trocar minha senha</h2>
      </div>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Input autoComplete="current-password" label="Senha atual" name="currentPassword" />
        <Input autoComplete="new-password" label="Nova senha" minLength={8} name="newPassword" />
        <Input autoComplete="new-password" label="Confirmar nova senha" minLength={8} name="confirmPassword" />
        {message ? <p className="rounded-md bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <button
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          <KeyRound size={16} />
          {loading ? "Alterando..." : "Alterar senha"}
        </button>
      </form>
    </section>
  );
}

function Input({
  autoComplete,
  label,
  minLength,
  name
}: {
  autoComplete: string;
  label: string;
  minLength?: number;
  name: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
      <input
        autoComplete={autoComplete}
        className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
        minLength={minLength}
        name={name}
        required
        type="password"
      />
    </label>
  );
}
