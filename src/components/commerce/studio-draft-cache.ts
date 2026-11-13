import { parseStudioDraft, STUDIO_DRAFT_TTL, type StudioDraft } from "@/domain/commerce/studio-draft";
export type StudioDraftScope = { slug: string; preview: boolean };
const memory = new Map<string, StudioDraft>();
const scopePrefix = (scope: StudioDraftScope) => `studio:${scope.preview ? "preview" : "store"}:${scope.slug}`;
function scopeKey(scope: StudioDraftScope) {
  const prefix = scopePrefix(scope);
  try {
    let token = sessionStorage.getItem("commerce-studio-tab");
    if (!token) { token = crypto.randomUUID(); sessionStorage.setItem("commerce-studio-tab", token); }
    return { key: `${prefix}:${token}:${sessionStorage.getItem(`${prefix}:reset`) ?? ""}`, persistent: true };
  } catch { return { key: prefix, persistent: false }; }
}
export async function clearStudioDraft(scope: StudioDraftScope) {
  const prefix = scopePrefix(scope);
  for (const key of memory.keys()) if (key === prefix || key.startsWith(`${prefix}:`)) memory.delete(key);
  try { sessionStorage.setItem(`${prefix}:reset`, crypto.randomUUID()); } catch { /* Memory-only sessions were cleared above. */ }
  try {
    await database<void>("readwrite", (store, result) => {
      const cursor = store.openKeyCursor(IDBKeyRange.bound(`${prefix}:`, `${prefix}:\uffff`));
      cursor.onsuccess = () => { if (cursor.result) { store.delete(cursor.result.primaryKey); cursor.result.continue(); } };
      result(undefined);
    });
  } catch { /* Rotation also prevents restoring old disk records if cleanup is blocked. */ }
}
function database<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Cache indisponível")); return; }
    let db: IDBDatabase | undefined, settled = false, value: T;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); db?.close();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Cache indisponível")), 1500);
    const open = indexedDB.open("commerce-studio-local", 1);
    open.onupgradeneeded = () => { const store = open.result.createObjectStore("drafts"); store.createIndex("expiresAt", "expiresAt"); };
    open.onerror = () => finish(open.error);
    open.onblocked = () => finish(new Error("Cache bloqueado"));
    open.onsuccess = () => {
      db = open.result;
      if (settled) { db.close(); return; }
      try {
        const transaction = db.transaction("drafts", mode);
        transaction.oncomplete = () => finish();
        transaction.onerror = () => finish(transaction.error || new Error("Cache indisponível"));
        transaction.onabort = () => finish(new Error("Cache interrompido"));
        action(transaction.objectStore("drafts"), next => { value = next; });
      } catch (error) { finish(error); }
    };
  });
}
export async function readStudioDraft(scope: StudioDraftScope) {
  const { key, persistent } = scopeKey(scope);
  try {
    if (persistent) {
      const stored = await database<unknown>("readonly", (store, result) => { const request = store.get(key); request.onsuccess = () => result(request.result); });
      const draft = parseStudioDraft(stored);
      if (draft) { memory.set(key, draft); return draft; }
    }
  } catch { /* Private browsing or blocked storage still allows this page's in-memory draft. */ }
  return parseStudioDraft(memory.get(key));
}
export async function writeStudioDraft(scope: StudioDraftScope, input: StudioDraft) {
  const draft = parseStudioDraft(input);
  if (!draft) return false;
  const { key, persistent } = scopeKey(scope);
  if ((memory.get(key)?.updatedAt ?? -1) <= draft.updatedAt) { memory.delete(key); memory.set(key, draft); }
  while (memory.size > 4) memory.delete(memory.keys().next().value!);
  if (!persistent) return false;
  try {
    await database<void>("readwrite", (store, result) => {
      const current = store.get(key);
      current.onsuccess = () => { if (!current.result || current.result.updatedAt <= draft.updatedAt) store.put({ ...draft, expiresAt: draft.updatedAt + STUDIO_DRAFT_TTL }, key); };
      const expired = store.index("expiresAt").openKeyCursor(IDBKeyRange.upperBound(Date.now()));
      expired.onsuccess = () => { const cursor = expired.result; if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); } };
      result(undefined);
    });
    return true;
  } catch { return false; }
}
