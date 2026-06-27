import { notFound, redirect } from "next/navigation";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";
import { hashInviteToken } from "@/domain/users/invites";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserInviteInfo } from "@/repositories/users";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  const { token } = await params;
  const invite = await getUserInviteInfo(hashInviteToken(token));
  if (!invite) notFound();

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{invite.tenant_name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Ativar acesso</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Convite para {invite.user_name} ({invite.user_email})
        </p>
        <AcceptInviteForm token={token} />
      </section>
    </main>
  );
}
