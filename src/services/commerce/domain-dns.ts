import { Resolver } from "node:dns/promises";
import { dnsRecordName, type DnsCheck, type DnsRecord, type DomainSetup } from "@/domain/commerce/domain-setup";

export async function resolveDomainRecord(type: DnsRecord["type"], name: string): Promise<string[]> {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  try {
    if (type === "A") return await resolver.resolve4(name);
    if (type === "AAAA") return await resolver.resolve6(name);
    if (type === "CNAME") return (await resolver.resolveCname(name)).map(value => value.toLowerCase().replace(/\.$/, ""));
    return (await resolver.resolveTxt(name)).map(parts => parts.join(""));
  } finally { resolver.cancel(); }
}
export async function inspectDomainDns(row: DomainSetup, read = resolveDomainRecord): Promise<DnsCheck> {
  const lookup = async (type: DnsRecord["type"], name: string) => {
    try { return { found: (await read(type, name)).slice(0, 20) }; }
    catch { return { found: [] as string[], error: "Registro não encontrado ou DNS indisponível. Aguarde a propagação e consulte novamente." }; }
  };
  const proof = await lookup("TXT", `_pricing-pro.${row.hostname}`);
  const records = await Promise.all(row.expected_records.map(async record => {
    const result = await lookup(record.type, dnsRecordName(record.name, row.hostname));
    const normalize = (value: string) => record.type === "CNAME" ? value.toLowerCase().replace(/\.$/, "") : record.type === "AAAA" ? new URL(`http://[${value}]/`).hostname : value;
    const expected = row.expected_records.filter(other => other.type === record.type && dnsRecordName(other.name, row.hostname) === dnsRecordName(record.name, row.hostname)).map(other => normalize(other.value));
    const found = result.found.map(normalize);
    const matched = record.type === "TXT" ? found.includes(normalize(record.value)) : expected.every(value => found.includes(value)) && found.length > 0 && found.every(value => expected.includes(value));
    return { ...record, ...result, matched };
  }));
  return { checkedAt: new Date().toISOString(), ownership: proof.found.includes(`pricing-pro=${row.verification_token}`), ownershipFound: proof.found, ownershipError: proof.error, records };
}
