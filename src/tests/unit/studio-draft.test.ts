import { afterEach, describe, expect, it, vi } from "vitest";
import { parseStudioDraft, STUDIO_DRAFT_TTL } from "@/domain/commerce/studio-draft";
import { clearStudioDraft, readStudioDraft, writeStudioDraft } from "@/components/commerce/studio-draft-cache";
import { studioInitialArtwork } from "@/domain/commerce/studio-demo";
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
describe("studio local drafts", () => {
  it("validates a full editable recipe and expires it after 24 hours", () => {
    const now = Date.now(), draft = { version: 1, updatedAt: now, productId: "one", artwork: { ...studioInitialArtwork(), text: "", backgroundType: "image", backgroundImage: { asset: { dataUrl: "data:image/png;base64,YQ==", fileName: "arte.png", width: 800, height: 600 }, scale: .5, offsetX: .2, offsetY: -.1, fillColor: "#123456" } } };
    expect(parseStudioDraft(draft, now)?.artwork.backgroundImage?.scale).toBe(.5);
    expect(parseStudioDraft(draft, now + STUDIO_DRAFT_TTL + 1)).toBeNull();
    expect(parseStudioDraft({ ...draft, artwork: { ...draft.artwork, backgroundImage: { ...draft.artwork.backgroundImage, asset: { ...draft.artwork.backgroundImage.asset, dataUrl: "data:image/svg+xml;base64,YQ==" } } } }, now)).toBeNull();
  });
  it("preserves the recipe in memory if IndexedDB is unavailable, without mixing tenants or preview", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const scope = { slug: `shop-${crypto.randomUUID()}`, preview: false };
    const draft = { version: 1 as const, updatedAt: Date.now(), productId: "one", artwork: { ...studioInitialArtwork(), text: "Minha arte" } };
    expect(await writeStudioDraft(scope, draft)).toBe(false);
    expect((await readStudioDraft(scope))?.artwork.text).toBe("Minha arte");
    await writeStudioDraft(scope, { ...draft, updatedAt: draft.updatedAt - 1000, artwork: { ...draft.artwork, text: "Uma gravação antiga" } });
    expect((await readStudioDraft(scope))?.artwork.text).toBe("Minha arte");
    expect(await readStudioDraft({ ...scope, preview: true })).toBeNull();
    expect(await readStudioDraft({ ...scope, slug: "different" })).toBeNull();
    const other = { ...scope, slug: "another-store" };
    await writeStudioDraft(other, draft);
    await clearStudioDraft(scope);
    expect(await readStudioDraft(scope)).toBeNull();
    expect((await readStudioDraft(other))?.artwork.text).toBe("Minha arte");
  });
});
