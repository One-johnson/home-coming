import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { SeedInitializer } from "@/components/SeedInitializer";
import { Analytics } from "@/components/Analytics";
import { ConvexSetupBanner } from "@/components/ConvexSetupBanner";
import { JsonLd } from "@/components/seo/JsonLd";
import { EVENT } from "@/lib/eventConfig";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SEO_KEYWORDS,
  SITE_NAME,
  buildEventJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  getSiteUrl,
} from "@/lib/seo";
import "./globals.css";

// Self-hosted (see scripts/download-fonts.mjs) so the build never depends on
// fetching from fonts.gstatic.com. Both are variable fonts: one woff2 covers
// the whole weight range.
const displayFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/CormorantGaramond.woff2", weight: "300 700", style: "normal" },
    { path: "./fonts/CormorantGaramond-Italic.woff2", weight: "300 700", style: "italic" },
  ],
});

const bodyFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [{ path: "./fonts/Manrope.woff2", weight: "400 800", style: "normal" }],
});

const siteUrl = getSiteUrl();
const ogImage = `${siteUrl}${DEFAULT_OG_IMAGE}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1a1a",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_NAME,
    template: `%s | ${EVENT.subtitle}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Dag Heward-Mills Ministries" }],
  creator: "Dag Heward-Mills Ministries",
  publisher: "Dag Heward-Mills Ministries",
  category: "religion",
  keywords: [...SEO_KEYWORDS],
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [{ url: "/dhmm.png", type: "image/png" }],
    apple: [{ url: "/dhmm.png" }],
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_GH",
    url: siteUrl,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: `${EVENT.fullTitle} — ${EVENT.venue}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "geo.region": "GH",
    "geo.placename": "Mampong",
  },
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
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <JsonLd
          data={[
            buildOrganizationJsonLd(),
            buildWebSiteJsonLd(),
            buildEventJsonLd(),
          ]}
        />
        <ConvexClientProvider>
          <Providers>
            <ConvexSetupBanner />
            <SeedInitializer />
            <Analytics />
            <SiteChrome>{children}</SiteChrome>
          </Providers>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
