import { OlistOAuthCompletion } from "@/components/olist/OlistOAuthCompletion";

export const metadata = { robots: { index: false, follow: false } };

export default async function OlistOAuthCompletePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <OlistOAuthCompletion attempt={typeof params.attempt === "string" ? params.attempt : ""} status={params.olist === "connected" ? "connected" : "error"} />;
}
