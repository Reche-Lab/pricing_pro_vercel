import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.APP_URL || "https://liaflow-calcula.vercel.app";
const title = "Pricing Pro | Precificação e orçamentos profissionais";
const description =
  "Calcule preços, margens, frete e descontos progressivos. Gere orçamentos em PDF, texto para WhatsApp e integre sua operação comercial em poucos cliques.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Pricing Pro",
  title: {
    default: title,
    template: "%s | Pricing Pro"
  },
  description,
  keywords: [
    "precificação",
    "orçamento",
    "desconto progressivo",
    "PDF",
    "WhatsApp",
    "frete",
    "multi-tenant",
    "CRM",
    "Olist",
    "Melhor Envio"
  ],
  authors: [{ name: "Pricing Pro" }],
  creator: "Pricing Pro",
  publisher: "Pricing Pro",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" }
    ],
    shortcut: "/favicon.ico"
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Pricing Pro",
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Pricing Pro - orçamentos profissionais em poucos cliques"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  category: "business"
};

export const viewport = {
  themeColor: "#09090B",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
