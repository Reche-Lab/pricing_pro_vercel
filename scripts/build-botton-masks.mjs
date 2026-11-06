import { readFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../public/mockups/botton-25mm-v1/", import.meta.url);
const model = JSON.parse(await readFile(new URL("modelo.json", root), "utf8"));
const size = 1254;

// Only generates technical vector layers. The AI-reconstructed photographs are never modified.
for (const [side, name] of [["front", "frente"], ["back", "verso"]]) {
  const face = model[side];
  const cx = (face.x + face.width / 2) * size, cy = (face.y + face.height / 2) * size;
  const rx = face.width * size / 2, ry = face.height * size / 2;
  const ellipse = (ratio = 1) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx * ratio}" ry="${ry * ratio}"/>`;
  const hole = side === "back" ? model.backOpeningRatio : 0;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  const matte = `<mask id="matte" maskUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}"><g fill="white">${ellipse()}</g><g fill="black">${hole ? ellipse(hole) : ""}</g></mask>`;
  const mask = `${head}<defs>${matte}</defs><rect width="${size}" height="${size}" fill="white" mask="url(#matte)"/></svg>`;
  const finish = `${head}<defs>${matte}
    <radialGradient id="shade"><stop offset="${hole || 0.65}" stop-color="black" stop-opacity="${hole ? 0.18 : 0}"/><stop offset="${hole ? 0.89 : 0.82}" stop-color="black" stop-opacity="0"/><stop offset="0.96" stop-color="black" stop-opacity="0.12"/><stop offset="1" stop-color="black" stop-opacity="0.32"/></radialGradient>
    <linearGradient id="light" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="white" stop-opacity="0.2"/><stop offset="0.4" stop-color="white" stop-opacity="0.025"/><stop offset="0.75" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.12"/></linearGradient>
    </defs><g mask="url(#matte)"><g fill="url(#shade)">${ellipse()}</g><g fill="url(#light)">${ellipse()}</g></g></svg>`;
  for (const [prefix, svg] of [["mascara", mask], ["acabamento", finish]]) {
    const output = new URL(`${prefix}-${name}.png`, root);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output.pathname);
    console.log(`Generated ${prefix}-${name}.png (${size} × ${size}, alpha)`);
  }
}
