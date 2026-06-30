"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

export function ForgotPasswordForm() {
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

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email") })
    });
    setLoading(false);

    if (!response.ok) {
      setError("Informe um email valido.");
      return;
    }

    formElement.reset();
    setMessage("Se o email existir e estiver ativo, enviaremos uma senha temporaria.");
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">Email</span>
        <input
          autoComplete="email"
          className="focus-ring w-full rounded-md border border-zinc-700 px-3 py-2"
          name="email"
          required
          type="email"
        />
      </label>
      {message ? <p className="rounded-md bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        type="submit"
      >
        <Mail size={16} />
        {loading ? "Enviando..." : "Enviar senha temporaria"}
      </button>
    </form>
  );
}
