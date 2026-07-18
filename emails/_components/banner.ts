export function getBannerUrl() {
  const siteUrl =
    process.env.EMAIL_BANNER_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";

  return `${siteUrl.replace(/\/$/, "")}/hero/banner.jpeg`;
}
