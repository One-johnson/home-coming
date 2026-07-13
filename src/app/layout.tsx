import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StickyMobileCTA } from "@/components/layout/StickyMobileCTA";
import { SeedInitializer } from "@/components/SeedInitializer";
import { Analytics } from "@/components/Analytics";
import { ConvexSetupBanner } from "@/components/ConvexSetupBanner";
import { EVENT } from "@/lib/eventConfig";
import "./globals.css";

const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${EVENT.name} — ${EVENT.subtitle}`,
  description: `Join us for ${EVENT.fullTitle}, ${EVENT.dates} at ${EVENT.venue}, ${EVENT.location}. Register and book accommodation for The Homecoming Convention.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col pb-20 md:pb-0" suppressHydrationWarning>
        <ConvexClientProvider>
          <Providers>
            <ConvexSetupBanner />
            <SeedInitializer />
            <Analytics />
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <StickyMobileCTA />
          </Providers>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
