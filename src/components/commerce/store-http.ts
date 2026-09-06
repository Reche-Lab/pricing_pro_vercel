export async function storeRequest(
  url: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error ?? "Não foi possível concluir. Tente novamente.",
    );
  return data;
}
export const storeMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
