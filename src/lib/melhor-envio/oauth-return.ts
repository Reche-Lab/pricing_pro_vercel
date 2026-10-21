export function melhorEnvioOAuthReturnPath(value: string | null | undefined) {
  return value && /^\/melhor-envio\/oauth\/complete\?attempt=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
    ? value : "/settings";
}
