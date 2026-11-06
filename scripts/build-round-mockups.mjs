import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const run = promisify(execFile);
const publicRoot = new URL("../public/", import.meta.url);
const sources = new URL("../assets/mockup-sources/redondos-v1/", import.meta.url);
const botton = JSON.parse(await readFile(new URL("mockups/botton-25mm-v1/modelo.json", publicRoot), "utf8"));
const provenance = JSON.parse(await readFile(new URL("origem.json", sources), "utf8"));
const original = await readFile(new URL(botton.back.baseUrl.slice(1), publicRoot));
const { width, height } = await sharp(original).metadata();
const face = botton.back;
const cx = (face.x + face.width / 2) * width, cy = (face.y + face.height / 2) * height;
const rx = face.width * width / 2 * botton.backOpeningRatio, ry = face.height * height / 2 * botton.backOpeningRatio;
const clip = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`);
const originalPixels = await sharp(original).ensureAlpha().raw().toBuffer();
const clipPixels = await sharp(clip).ensureAlpha().raw().toBuffer();

for (const [id, label] of [["ima", "Ímã"], ["espelho", "Espelho"], ["abridor", "Abridor"]]) {
  const directory = new URL(`mockups/${id}-redondo-v1/`, publicRoot);
  await mkdir(directory, { recursive: true });
  const generated = await readFile(new URL(`${id}.png`, sources));
  // Replace, rather than paint over, the center so an opener's transparent hole cannot reveal the old pin.
  const replacement = await sharp(generated).resize(width, height, { fit: "fill" }).ensureAlpha()
    .composite([{ input: clip, blend: "dest-in" }]).png().toBuffer();
  const rim = await sharp(original).composite([{ input: clip, blend: "dest-out" }]).png().toBuffer();
  const pixels = await sharp(rim).composite([{ input: replacement }]).ensureAlpha().raw().toBuffer();
  // Avoid premultiplication rounding on the untouched, slightly translucent metal photograph.
  for (let offset = 0; offset < pixels.length; offset += 4)
    if (!clipPixels[offset + 3]) originalPixels.copy(pixels, offset, offset, offset + 4);
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL("base-verso.png", directory)));
  const model = { ...botton, back: { ...botton.back, baseUrl: `/mockups/${id}-redondo-v1/base-verso.png` } };
  await writeFile(new URL("modelo.json", directory), JSON.stringify(model, null, 2) + "\n");
  await writeFile(new URL("origem.json", directory), JSON.stringify({
    product: label, method: provenance.method, prompt: provenance.prompts[id],
    sharedFront: botton.front, sharedRearMask: botton.back.maskUrl, sharedRearOverlay: botton.back.overlayUrl,
    notice: provenance.notice, sizePx: width, technicalAssembly: "scripts/build-round-mockups.mjs"
  }, null, 2) + "\n");
  await writeFile(new URL("LEIA-ME.txt", directory), `Modelo ilustrativo: ${label}\n\nFrente, borda, máscaras e calibração são compartilhadas com o Botton.\nSomente o acabamento central do verso foi substituído.\nAs medidas de segurança, sangria e corte são as cadastradas no produto; não são redefinidas por este modelo.\nConfira o acabamento com uma peça física antes de publicar.\nAs imagens e máscaras do mockup não devem integrar o PDF de produção.\n`);
  const archive = fileURLToPath(new URL(`kit-${id}.zip`, directory));
  await rm(archive, { force: true });
  const paths = [model.front.baseUrl, model.front.maskUrl, model.front.overlayUrl, model.back.baseUrl, model.back.maskUrl, model.back.overlayUrl]
    .map(path => fileURLToPath(new URL(path.slice(1), publicRoot)));
  await run("zip", ["-q", "-X", "-j", archive, ...paths, ...["modelo.json", "origem.json", "LEIA-ME.txt"].map(name => fileURLToPath(new URL(name, directory)))]);
  console.log(`Generated ${label}: base-verso.png, shared model and kit (${width} × ${height}, alpha).`);
}
