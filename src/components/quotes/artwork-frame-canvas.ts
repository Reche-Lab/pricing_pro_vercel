import { artworkFramePlacement, type ArtworkFrame } from "@/domain/artwork/framing";

export function drawArtworkFrame(context: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, frame: ArtworkFrame) {
  const placement = artworkFramePlacement(width, height, frame);
  const cover = Math.max(placement.width / sourceWidth, placement.height / sourceHeight);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(placement.rotationDegrees * Math.PI / 180);
  context.translate(-width / 2, -height / 2);
  // SVG's xMidYMid slice clips to the image box before rotating the composition.
  context.beginPath();
  context.rect(placement.x, placement.y, placement.width, placement.height);
  context.clip();
  context.drawImage(source, placement.x + (placement.width - sourceWidth * cover) / 2,
    placement.y + (placement.height - sourceHeight * cover) / 2, sourceWidth * cover, sourceHeight * cover);
  context.restore();
}
