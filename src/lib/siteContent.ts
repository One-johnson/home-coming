/**
 * Static site copy for pages that rarely change.
 * Swap these imports for a Payload CMS fetch later without changing page components.
 */
import about from "@/content/about.json";
import home from "@/content/home.json";
import privacy from "@/content/privacy.json";
import terms from "@/content/terms.json";

export const aboutContent = about;
export const homeContent = home;
export const privacyContent = privacy;
export const termsContent = terms;

export type AboutContent = typeof aboutContent;
export type HomeContent = typeof homeContent;
export type PrivacyContent = typeof privacyContent;
export type TermsContent = typeof termsContent;
export type AboutPillar = AboutContent["church"]["pillars"][number];
export type HomeStat = HomeContent["highlights"]["stats"][number];
export type HostStat = HomeContent["host"]["stats"][number];
export type VenueHighlight = HomeContent["venue"]["highlights"][number];
