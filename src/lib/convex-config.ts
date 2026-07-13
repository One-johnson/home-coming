export function isConvexConfigured() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return Boolean(
    url &&
      url.startsWith("https://") &&
      url.includes(".convex.cloud") &&
      !url.includes("placeholder"),
  );
}
