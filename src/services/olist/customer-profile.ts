export type OlistCustomerProfile = Partial<Record<
  "name" | "document" | "email" | "phone" | "postalCode" | "addressLine" |
  "addressNumber" | "addressComplement" | "district" | "city" | "state", string
>>;

export function extractOlistCustomerProfile(data: unknown, externalId: string): OlistCustomerProfile | null {
  const source = findContact(data, externalId);
  if (!source) return null;
  const address = [source.endereco, source.enderecoPrincipal, source.enderecoEntrega].find(isRecord) ?? source;
  const values: OlistCustomerProfile = {
    name: text(source, ["nome", "name", "razaoSocial", "fantasia"]),
    document: text(source, ["cpfCnpj", "documento", "document"]),
    email: text(source, ["email"]),
    phone: text(source, ["celular", "telefone", "phone"]),
    postalCode: text(address, ["cep", "postalCode"]),
    addressLine: text(address, ["endereco", "logradouro", "addressLine"]),
    addressNumber: text(address, ["numero", "enderecoNro", "number"]),
    addressComplement: text(address, ["complemento", "complement"]),
    district: text(address, ["bairro", "district"]),
    city: text(address, ["municipio", "cidade", "city"]),
    state: text(address, ["uf", "estado", "state"])?.toUpperCase()
  };
  const result = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
  return Object.keys(result).length ? result : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findContact(data: unknown, id: string, depth = 0): Record<string, unknown> | null {
  if (depth > 6) return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findContact(entry, id, depth + 1);
      if (found) return found;
    }
  }
  if (!isRecord(data)) return null;
  if (text(data, ["id", "idContato"]) === id) return data;
  for (const key of ["itens", "items", "data", "retorno", "contato", "result"]) {
    const found = findContact(data[key], id, depth + 1);
    if (found) return found;
  }
  return null;
}

function text(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}
