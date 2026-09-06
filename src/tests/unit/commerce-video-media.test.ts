// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginCommerceVideo,
  completeCommerceVideo,
  validateCommerceVideo,
} from "@/services/commerce/video-media";
import {
  createVideoUpload,
  lockVideoUpload,
  markVideoReady,
} from "@/repositories/commerce-media";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({
    SUPABASE_URL: "https://storage.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "private-test-key",
  }),
}));
vi.mock("@/repositories/commerce", () => ({
  commerceTransaction: async (
    callback: (client: unknown) => Promise<unknown>,
  ) => callback({}),
}));
vi.mock("@/repositories/commerce-media", () => ({
  createVideoUpload: vi.fn(),
  lockVideoUpload: vi.fn(),
  markVideoReady: vi.fn(),
}));
const tenant = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
// ISO base-media container header used to test signature detection, not decoding.
const bytes = Buffer.from(
  "000000186674797069736f6d0000020069736f6d6d703432",
  "hex",
);
const upload = {
  id,
  tenant_id: tenant,
  created_by: user,
  mime_type: "video/mp4",
  file_size: bytes.length,
  status: "pending" as const,
  expires_at: new Date(Date.now() + 600000),
};
beforeEach(() => {
  vi.mocked(createVideoUpload).mockResolvedValue(upload);
  vi.mocked(lockVideoUpload).mockResolvedValue(upload);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("commerce protected video upload", () => {
  it("authorizes only a private generated path without returning service credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          url: `/object/upload/sign/commerce-video-staging/${tenant}/${id}.mp4?token=temporary`,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await beginCommerceVideo(tenant, user, {
      fileName: "../../unsafe.mp4",
      fileSize: bytes.length,
      mimeType: "video/mp4",
    });
    expect(result.uploadId).toBe(id);
    expect(result.signedUrl).toContain(
      `/commerce-video-staging/${tenant}/${id}.mp4?token=`,
    );
    expect(JSON.stringify(result)).not.toContain("private-test-key");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/commerce-video-staging/${tenant}/${id}.mp4`),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-upsert": "false" }),
      }),
    );
  });
  it("checks the actual byte size and container before publishing", async () => {
    await expect(
      validateCommerceVideo(new Response(bytes), bytes.length, "video/mp4"),
    ).resolves.toEqual(bytes);
    await expect(
      validateCommerceVideo(new Response("not a video"), 11, "video/mp4"),
    ).rejects.toThrow("conteúdo");
    await expect(
      validateCommerceVideo(new Response(bytes), bytes.length - 1, "video/mp4"),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      validateCommerceVideo(new Response(bytes), bytes.length + 1, "video/mp4"),
    ).rejects.toThrow("incompleto");
    await expect(
      validateCommerceVideo(
        new Response(bytes, { headers: { "content-length": "20971521" } }),
        bytes.length,
        "video/mp4",
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      validateCommerceVideo(new Response(bytes), bytes.length, "video/webm"),
    ).rejects.toThrow("conteúdo");
  });
  it("publishes validated bytes then marks completion and removes staging", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(bytes))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    const media = await completeCommerceVideo(tenant, user, id);
    expect(media).toEqual({
      id,
      kind: "video",
      url: `https://storage.example.test/storage/v1/object/public/commerce-videos/${tenant}/${id}.mp4`,
    });
    expect(lockVideoUpload).toHaveBeenCalledWith({}, tenant, user, id);
    expect(markVideoReady).toHaveBeenCalledWith({}, upload);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: bytes,
      headers: { "content-type": "video/mp4" },
    });
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "DELETE" });
  });
  it("does not publish forged files or complete another user's upload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.alloc(bytes.length)));
    vi.stubGlobal("fetch", fetcher);
    await expect(completeCommerceVideo(tenant, user, id)).rejects.toThrow(
      "conteúdo",
    );
    expect(markVideoReady).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    vi.mocked(lockVideoUpload).mockRejectedValue(
      new CommerceError("Não encontrado", 404),
    );
    await expect(completeCommerceVideo(tenant, user, id)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reuses ready uploads, but rejects expired pending uploads", async () => {
    vi.mocked(lockVideoUpload).mockResolvedValue({
      ...upload,
      status: "ready",
    });
    const fetcher = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    expect((await completeCommerceVideo(tenant, user, id)).id).toBe(id);
    expect(markVideoReady).not.toHaveBeenCalled();
    expect(
      fetcher.mock.calls.every((call) => call[1].method === "DELETE"),
    ).toBe(true);
    fetcher.mockClear();
    vi.mocked(lockVideoUpload).mockResolvedValue({
      ...upload,
      expires_at: new Date(0),
    });
    await expect(completeCommerceVideo(tenant, user, id)).rejects.toMatchObject(
      { status: 410 },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
