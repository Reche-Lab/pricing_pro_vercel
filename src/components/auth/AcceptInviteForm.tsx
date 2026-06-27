"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Convite invalido ou expirado.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">Nova senha</span>
        <input
          autoComplete="new-password"
          className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">Confirmar senha</span>
        <input
          autoComplete="new-password"
          className="focus-ring w-full rounded-md border border-zinc-300 px-3 py-2"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        className="focus-ring w-full rounded-md bg-zinc-950 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        {loading ? "Ativando..." : "Definir senha e entrar"}
      </button>
    </form>
  );
}
