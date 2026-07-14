import type { Metadata } from "next";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata(PAGE_SEO.messages);

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
