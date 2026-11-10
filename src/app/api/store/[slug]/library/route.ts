import { libraryListing } from "@/services/commerce/library-http";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) { return libraryListing(request, (await params).slug); }
