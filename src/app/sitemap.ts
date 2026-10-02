import type { MetadataRoute } from "next";
import { getSiteUrl, PAGE_SEO } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  return Object.values(PAGE_SEO)
    .map((page) => ({
      url: `${siteUrl}${page.path === "/" ? "" : page.path}`,
      lastModified: now,
      changeFrequency: page.path === "/" ? "weekly" : "monthly",
      priority: page.path === "/" ? 1 : 0.7,
    }));
}
