import type { Metadata } from "next";
import { headers } from "next/headers";
import { Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const playfair = Playfair_Display({ variable: "--font-display", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "Paula Peixoto — Cabeleireiro & Beleza";
  const description = "Cabelo, coloração, unhas e estética com mais de 20 anos de experiência e atendimento personalizado.";
  return {
    metadataBase: base,
    title: { default: title, template: "%s · Paula Peixoto" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", locale: "pt_PT", images: [{ url: new URL("/og.png", base), width: 1730, height: 909, alt: "Paula Peixoto — Cabeleireiro & Beleza" }] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", base)] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-PT"><body className={`${montserrat.variable} ${playfair.variable}`}>{children}</body></html>;
}
