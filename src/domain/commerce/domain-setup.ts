import { z } from "zod";

export const publicHostname = z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Informe o domínio sem https://, porta ou caminhos.")
  .refine(value => !/\.(?:local|internal|localhost|lan|home|test|invalid|onion)$/.test(value), "Use um domínio público.");
export const domainRequestSchema = z.object({ hostname: publicHostname, provider: z.string().trim().max(100), includeWww: z.boolean() }).strict();
export const dnsRecordSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "TXT"]), name: z.string().trim().min(1).max(253),
  value: z.string().trim().min(1).max(1024).refine(value => !/[\r\n\x00]/.test(value), "Valor inválido."),
  ttl: z.number().int().min(60).max(86400),
}).strict().superRefine((record, ctx) => {
  const valid = record.type === "A" ? z.string().ip({ version: "v4" }).safeParse(record.value).success : record.type === "AAAA" ? z.string().ip({ version: "v6" }).safeParse(record.value).success : record.type === "CNAME" ? publicHostname.safeParse(record.value.replace(/\.$/, "")).success : true;
  if (!valid) ctx.addIssue({ code: "custom", path: ["value"], message: "O valor não corresponde ao tipo de registro." });
});
export type DnsRecord = z.infer<typeof dnsRecordSchema>;
export type DnsCheck = { checkedAt: string; ownership: boolean; ownershipFound: string[]; records: (DnsRecord & { matched: boolean; found: string[]; error?: string })[]; ownershipError?: string };
export type DomainSetup = {
  id: string; tenant_id: string; hostname: string; dns_provider: string; verification_token: string;
  expected_records: DnsRecord[]; operator_note: string; revision: number;
  vercel_added_at: string | null; https_confirmed_at: string | null; approved_at: string | null;
  last_check: DnsCheck | null; authorized: boolean; tenant_name?: string; tenant_slug?: string;
};
export function dnsRecordName(input: string, host: string) {
  const name = input.toLowerCase().replace(/\.$/, "");
  const full = name === "@" ? host : name.includes(".") ? name : `${name}.${host}`;
  if (full.length > 253 || !/^[a-z0-9_.-]+$/.test(full) || full.split(".").some(label => !label || label.length > 63 || /^-|-$/.test(label)) || full !== host && !full.endsWith(`.${host}`)) throw new Error("O nome do registro deve pertencer ao domínio solicitado.");
  return full;
}
export function canApproveDomain(row: { vercel_added_at: string | null; https_confirmed_at: string | null; expected_records: unknown[]; last_check: Pick<DnsCheck, "checkedAt" | "ownership"> & { records: { matched: boolean }[] } | null }, now = Date.now()) {
  const check = row.last_check, age = check ? now - new Date(check.checkedAt).getTime() : Infinity;
  return Boolean(row.vercel_added_at && row.https_confirmed_at && row.expected_records.length && check?.ownership && age >= 0 && age < 600000 && check.records.length === row.expected_records.length && check.records.every(record => record.matched));
}
