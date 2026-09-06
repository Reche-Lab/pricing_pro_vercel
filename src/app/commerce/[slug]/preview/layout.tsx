import { CommercePreviewProvider } from "@/components/commerce/CommercePreviewProvider";

export default async function PreviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <CommercePreviewProvider key={slug} slug={slug}>
      {children}
    </CommercePreviewProvider>
  );
}
