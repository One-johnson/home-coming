import { NextResponse } from "next/server";
import {
  getDerivedThumbnailUrl,
  isRumbleUrl,
  rumbleOEmbedUrl,
} from "@/lib/mediaLinks";

function rumbleEmbedIdFromHtml(html: string | undefined) {
  if (!html) return null;
  const match = html.match(/rumble\.com\/embed\/([^/"'?]+)/i);
  return match?.[1] ?? null;
}

async function resolveRumblePoster(pageUrl: string): Promise<string | null> {
  const oembedRes = await fetch(rumbleOEmbedUrl(pageUrl), {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!oembedRes.ok) return null;

  const oembed = (await oembedRes.json()) as {
    html?: string;
    thumbnail_url?: string;
  };

  const embedId = rumbleEmbedIdFromHtml(oembed.html);
  if (!embedId) {
    return oembed.thumbnail_url?.trim() || null;
  }

  const embedRes = await fetch(
    `https://rumble.com/embedJS/u3/?request=video&v=${encodeURIComponent(embedId)}`,
    { next: { revalidate: 60 * 60 * 24 } },
  );
  if (!embedRes.ok) {
    return oembed.thumbnail_url?.trim() || null;
  }

  const embed = (await embedRes.json()) as {
    i?: string;
    t?: Array<{ i?: string }>;
  };

  // Prefer player poster (`i`) — matches what viewers see on rumble.com.
  return (
    embed.i?.trim() ||
    embed.t?.[0]?.i?.trim() ||
    oembed.thumbnail_url?.trim() ||
    null
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ thumbnailUrl: null }, { status: 400 });
  }

  const derived = getDerivedThumbnailUrl(url);
  if (derived) {
    return NextResponse.json({ thumbnailUrl: derived });
  }

  if (isRumbleUrl(url)) {
    try {
      const thumbnailUrl = await resolveRumblePoster(url);
      return NextResponse.json({ thumbnailUrl });
    } catch {
      // fall through
    }
  }

  return NextResponse.json({ thumbnailUrl: null });
}
