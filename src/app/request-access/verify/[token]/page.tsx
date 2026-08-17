import { VerifyAccessRequest } from "@/components/auth/VerifyAccessRequest";

export default async function VerifyAccessRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4"><section className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/80 p-6"><VerifyAccessRequest token={token} /></section></main>;
}
