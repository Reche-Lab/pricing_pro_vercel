import { CommerceError } from "@/domain/commerce/commerce";
import { normalizeGoogleReviews, type GoogleReviewsData } from "@/domain/commerce/google-reviews";
import { decryptTenantSecret } from "@/lib/crypto/secrets";
import { loadGoogleReviews, reserveGoogleReviewsRequest, type GoogleReviewsConnection } from "@/repositories/commerce-google-reviews";
export const GOOGLE_REVIEWS_FIELDS = "id,displayName,googleMapsUri,rating,userRatingCount,reviews,attributions";
class GoogleReviewsError extends CommerceError {
  constructor(message: string, public code: string, status = 502) { super(message, status); this.name = "GoogleReviewsError"; }
}
function failure(status: number) {
  if (status === 401 || status === 403) return new GoogleReviewsError("O Google não autorizou a consulta. Confira a chave, a ativação da Places API (New), o faturamento e as restrições da chave para uso no servidor.", "google_access_denied");
  if (status === 404 || status === 400) return new GoogleReviewsError("O Google não encontrou o perfil com este Place ID. Confira o identificador da empresa.", "google_place_invalid");
  if (status === 429) return new GoogleReviewsError("A cota do Google foi atingida. Confira os limites do projeto no Google Cloud e tente mais tarde.", "google_quota");
  return new GoogleReviewsError("O Google está indisponível no momento. Tente novamente mais tarde.", "google_unavailable");
}
export async function fetchGoogleReviews(row: GoogleReviewsConnection, options: { testing?: boolean; signal?: AbortSignal; request?: typeof fetch } = {}): Promise<GoogleReviewsData> {
  if (!row.api_key_encrypted || (!options.testing && !row.enabled)) throw new CommerceError("As avaliações desta loja estão desativadas.", 404);
  let apiKey: string;
  try { apiKey = decryptTenantSecret<{ apiKey: string }>(row.api_key_encrypted).apiKey; }
  catch { throw new GoogleReviewsError("Não foi possível acessar a credencial salva. Cadastre a chave novamente.", "google_credentials_unavailable", 503); }
  if (!apiKey) throw new GoogleReviewsError("Cadastre a chave da Places API (New).", "google_credentials_unavailable", 503);
  await reserveGoogleReviewsRequest(row, !options.testing);
  const debugId = crypto.randomUUID(), start = Date.now();
  const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(row.place_id)}?languageCode=pt-BR`;
  console.info("Google reviews request started.", { debugId, tenantId: row.tenant_id, testing: Boolean(options.testing) });
  let status: number | undefined;
  try {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
    const response = await (options.request ?? fetch)(endpoint, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_REVIEWS_FIELDS }, cache: "no-store", redirect: "error", signal });
    status = response.status;
    if (!response.ok) throw failure(response.status);
    let data: GoogleReviewsData;
    try { data = normalizeGoogleReviews(await response.json(), row.place_id); }
    catch { throw new GoogleReviewsError("A resposta do Google não trouxe dados válidos para este perfil. Confira o Place ID e tente novamente.", "google_invalid_response"); }
    const current = await loadGoogleReviews(row.tenant_id);
    if (!current || current.revision !== row.revision || !options.testing && !current.enabled) throw new CommerceError("A configuração mudou durante a consulta. Recarregue e tente novamente.", 409);
    console.info("Google reviews request completed.", { debugId, tenantId: row.tenant_id, status, durationMs: Date.now() - start });
    return data;
  } catch (error) {
    const safe = error instanceof CommerceError ? error : new GoogleReviewsError("A consulta ao Google não terminou. Verifique a conexão e tente novamente mais tarde.", "google_connection_failed");
    console.warn("Google reviews request failed.", { debugId, tenantId: row.tenant_id, status, durationMs: Date.now() - start, code: safe instanceof GoogleReviewsError ? safe.code : "settings_changed" });
    throw safe;
  }
}
