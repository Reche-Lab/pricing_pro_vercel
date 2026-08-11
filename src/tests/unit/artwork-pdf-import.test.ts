import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { looksLikeArtworkTemplate, suggestedPdfArtworkName } from "@/domain/artwork/pdf-import";
import { validateArtworkPdf } from "@/services/artwork/pdf-import";

describe("artwork PDF import", () => {
  it("validates the real page count of a PDF", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]); pdf.addPage([100, 100]);
    const bytes = await pdf.save();
    const result = await validateArtworkPdf({
      dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
      declaredSize: bytes.length,
      declaredPageCount: 2
    });
    expect(result.pageCount).toBe(2);
  });

  it("rejects a declared page count different from the document", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
    const bytes = await pdf.save();
    await expect(validateArtworkPdf({
      dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
      declaredSize: bytes.length,
      declaredPageCount: 2
    })).rejects.toThrow("quantidade de páginas");
  });

  it("recognizes a template and proposes useful names", () => {
    expect(looksLikeArtworkTemplate("BOTTON REDONDO 35 mm")).toBe(true);
    expect(suggestedPdfArtworkName(3, "Arte aniversário Lucas")).toBe("Arte aniversário Lucas");
    expect(suggestedPdfArtworkName(4, "")).toBe("Arte da página 4");
  });
});
