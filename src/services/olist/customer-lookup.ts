export type OlistCustomerLookupField = "nome" | "cpfCnpj" | "celular" | "email" | "codigo";
export type OlistCustomerLookupValues = Partial<Record<OlistCustomerLookupField, string | null>>;
export type OlistCustomerLookupInput = OlistCustomerLookupValues & {
  mode?: "auto" | OlistCustomerLookupField;
  value?: string | null;
  preferredField?: OlistCustomerLookupField;
};
export type OlistCustomerLookupCriteria = { mode: OlistCustomerLookupField; value: string };

const fields: OlistCustomerLookupField[] = ["nome", "cpfCnpj", "celular", "email", "codigo"];

function normalizedValues(input: OlistCustomerLookupValues): Record<OlistCustomerLookupField, string> {
  return {
    nome: input.nome?.trim() ?? "",
    cpfCnpj: input.cpfCnpj?.replace(/\D/g, "") ?? "",
    celular: input.celular?.replace(/\D/g, "") ?? "",
    email: input.email?.trim() ?? "",
    codigo: input.codigo?.trim() ?? ""
  };
}

export function resolveOlistCustomerLookupCriteria(input: OlistCustomerLookupInput): OlistCustomerLookupCriteria {
  const explicitValue = input.value?.trim();
  const values = normalizedValues(explicitValue ? Object.fromEntries(fields.map(field => [field, explicitValue])) : input);
  let mode = input.mode ?? "auto";
  if (mode === "auto") {
    if (values.cpfCnpj.length === 11 || values.cpfCnpj.length === 14) mode = "cpfCnpj";
    else if (values.celular.length >= 10) mode = "celular";
    else if (values.email.includes("@")) mode = "email";
    else mode = "nome";
  }
  return { mode, value: values[mode] };
}

export function resolveQuoteCustomerLookupCriteria(
  input: OlistCustomerLookupInput,
  defaults: OlistCustomerLookupValues
): OlistCustomerLookupCriteria {
  const merged = Object.fromEntries(fields.map(field => [field, input[field] ?? defaults[field]]));
  if (input.value?.trim() || (input.mode && input.mode !== "auto")) {
    return resolveOlistCustomerLookupCriteria({ ...merged, mode: input.mode, value: input.value });
  }
  if (input.preferredField) {
    return resolveOlistCustomerLookupCriteria({ ...merged, mode: input.preferredField });
  }

  const values = normalizedValues(merged);
  const saved = normalizedValues(defaults);
  // A partial name entered by the user must take precedence over untouched saved identifiers.
  const edited = fields.filter(field => field !== "codigo" && values[field] && values[field] !== saved[field]);
  return resolveOlistCustomerLookupCriteria(edited.length
    ? Object.fromEntries(edited.map(field => [field, values[field]]))
    : values);
}

export function buildOlistCustomerLookupPath(path: string, criteria: OlistCustomerLookupCriteria, status?: string | null) {
  const url = new URL(path, "https://olist.invalid");
  for (const field of fields) url.searchParams.delete(field);
  url.searchParams.delete("situacao");
  url.searchParams.set(criteria.mode, criteria.value);
  if (status) url.searchParams.set("situacao", status);
  url.searchParams.set("limit", "5");
  url.searchParams.set("offset", "0");
  return `${url.pathname}?${url.searchParams.toString()}`;
}
