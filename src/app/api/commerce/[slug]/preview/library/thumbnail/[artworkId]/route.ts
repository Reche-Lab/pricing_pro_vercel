import { libraryThumbnail } from "@/services/commerce/library-http";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; artworkId: string }> }) { const { slug, artworkId } = await params; return libraryThumbnail(request, slug, artworkId, true); }
