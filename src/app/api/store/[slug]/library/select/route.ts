import { librarySelection } from "@/services/commerce/library-http";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) { return librarySelection(request, (await params).slug); }
