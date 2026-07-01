export type CepAddress = {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export function normalizeCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(value: string) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function fetchCepAddress(cep: string): Promise<CepAddress | null> {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) return null;

  const payload = (await response.json()) as ViaCepResponse;
  if (payload.erro) return null;

  return {
    cep: payload.cep ?? formatCep(digits),
    street: payload.logradouro ?? "",
    district: payload.bairro ?? "",
    city: payload.localidade ?? "",
    state: payload.uf ?? ""
  };
}
