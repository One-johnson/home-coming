/**
 * Static site copy for pages that rarely change.
 * Swap these imports for a Payload CMS fetch later without changing page components.
 */
import about from "@/content/about.json";
import home from "@/content/home.json";

export const aboutContent = about;
export const homeContent = home;

export type AboutContent = typeof aboutContent;
export type HomeContent = typeof homeContent;
export type AboutChurchSection = AboutContent["church"]["sections"][number];
export type HomeStat = HomeContent["highlights"]["stats"][number];
export type VenueHighlight = HomeContent["venue"]["highlights"][number];
