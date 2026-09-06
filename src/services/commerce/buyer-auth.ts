import { randomInt } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { sendEmail } from "@/services/email/invite-email";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  commerceTransaction,
  hashCommerceToken,
  newCommerceToken,
  type BuyerSession,
  type CommerceStore,
} from "@/repositories/commerce";

export async function requestBuyerCode(
  store: CommerceStore,
  session: BuyerSession,
  email: string,
  name: string,
) {
  const code = String(randomInt(100000, 1000000));
  const id = crypto.randomUUID();
  await getPool().query(
    `insert into commerce_login_challenges(id,tenant_id,session_id,email,name,code_hash) values($1,$2,$3,$4,$5,$6)`,
    [
      id,
      store.tenant_id,
      session.id,
      email,
      name,
      hashCommerceToken(`${id}:${code}`),
    ],
  );
  const text = `Seu código para acessar ${store.settings.name}: ${code}.\nVálido por 10 minutos. Não compartilhe este código. Se não solicitou o acesso, ignore esta mensagem.`;
  const delivery = await sendEmail({
    to: email,
    subject: "Código de acesso à sua loja",
    text,
    html: `<p>Seu código de acesso: <strong>${code}</strong></p><p>Válido por 10 minutos. Não compartilhe este código.</p>`,
  });
  if (!delivery.sent) {
    await getPool().query(
      "delete from commerce_login_challenges where tenant_id=$1 and id=$2",
      [store.tenant_id, id],
    );
    throw new CommerceError(
      "Não foi possível enviar o e-mail de acesso. Tente mais tarde.",
      503,
    );
  }
  return { challengeId: id };
}
export async function verifyBuyerCode(
  store: CommerceStore,
  session: BuyerSession,
  challengeId: string,
  code: string,
) {
  const token = newCommerceToken();
  const success = await commerceTransaction(async (client) => {
    const current = await client.query(
      "select id from commerce_sessions where tenant_id=$1 and id=$2 and expires_at>now() for update",
      [store.tenant_id, session.id],
    );
    if (!current.rowCount) return false;
    const result = await client.query(
      `select * from commerce_login_challenges where tenant_id=$1 and session_id=$2 and id=$3 and expires_at>now() and consumed_at is null for update`,
      [store.tenant_id, session.id, challengeId],
    );
    const challenge = result.rows[0];
    if (!challenge || challenge.attempts >= 5) return false;
    await client.query(
      "update commerce_login_challenges set attempts=attempts+1 where tenant_id=$1 and id=$2",
      [store.tenant_id, challengeId],
    );
    if (challenge.code_hash !== hashCommerceToken(`${challengeId}:${code}`))
      return false;
    const buyer = await client.query<{ id: string }>(
      `insert into commerce_customers(tenant_id,email,name) values($1,$2,$3) on conflict(tenant_id,email) do update set email=excluded.email returning id`,
      [store.tenant_id, challenge.email, challenge.name],
    );
    await client.query(
      "update commerce_sessions set customer_id=$3,token_hash=$4,expires_at=now()+interval '14 days' where tenant_id=$1 and id=$2",
      [store.tenant_id, session.id, buyer.rows[0].id, hashCommerceToken(token)],
    );
    await client.query(
      "update commerce_login_challenges set consumed_at=now() where tenant_id=$1 and session_id=$2",
      [store.tenant_id, session.id],
    );
    return true;
  });
  if (!success)
    throw new CommerceError(
      "Código inválido ou expirado. Solicite outro código.",
    );
  return token;
}
