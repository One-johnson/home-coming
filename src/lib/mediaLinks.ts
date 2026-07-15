export function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function getYouTubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

export function isYouTubeUrl(url: string) {
  return getYouTubeVideoId(url) !== null;
}

export function isRumbleUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").includes("rumble.com");
  } catch {
    return false;
  }
}

/** Derive a thumbnail URL synchronously when possible (YouTube only). */
export function getDerivedThumbnailUrl(url: string): string | null {
  const videoId = getYouTubeVideoId(url);
  return videoId ? getYouTubeThumbnail(videoId) : null;
}

export function rumbleOEmbedUrl(pageUrl: string) {
  return `https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(pageUrl)}`;
}

/** Friendly host label for non-YouTube links, e.g. "Vimeo", "Rumble". */
export function getMediaHostLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtu")) return "YouTube";
    if (host.includes("rumble")) return "Rumble";
    if (host.includes("vimeo")) return "Vimeo";
    if (host.includes("facebook") || host.includes("fb.watch")) return "Facebook";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("soundcloud")) return "SoundCloud";
    return host;
  } catch {
    return "External link";
  }
}
