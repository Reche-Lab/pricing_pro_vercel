import { BlockList, isIP } from "node:net";
import { Resolver } from "node:dns/promises";
const blocked4 = new BlockList(), blocked6 = new BlockList(), globalV6 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked4.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 96], ["::ffff:0:0", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["2001::", 23], ["2002::", 16]] as const) blocked6.addSubnet(address, prefix, "ipv6");
globalV6.addSubnet("2000::", 3, "ipv6");
export function isPublicSmtpAddress(address: string) {
  const version = isIP(address);
  return version === 4 ? !blocked4.check(address, "ipv4") : version === 6 && globalV6.check(address, "ipv6") && !blocked6.check(address, "ipv6");
}
export async function resolveSmtpAddress(host: string) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  try {
    let addresses = await resolver.resolve4(host).catch(() => [] as string[]);
    if (!addresses.length) addresses = await resolver.resolve6(host).catch(() => [] as string[]);
    if (!addresses.length || addresses.some(address => !isPublicSmtpAddress(address))) throw new Error("SMTP exige um endereço público válido.");
    return addresses[0];
  } finally { resolver.cancel(); }
}
