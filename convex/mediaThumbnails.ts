import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

function youtubeVideoId(url: string): string | null {
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

function isRumbleUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").includes("rumble.com");
  } catch {
    return false;
  }
}

function rumbleEmbedIdFromHtml(html: string | undefined) {
  if (!html) return null;
  const match = html.match(/rumble\.com\/embed\/([^/"'?]+)/i);
  return match?.[1] ?? null;
}

async function resolveRumblePoster(pageUrl: string): Promise<string | null> {
  // oEmbed thumbnail is often an auto frame-grab; the embed API `i` field is the
  // custom poster Rumble shows on the watch page.
  const oembedRes = await fetch(
    `https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(pageUrl)}`,
  );
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
  );
  if (!embedRes.ok) {
    return oembed.thumbnail_url?.trim() || null;
  }

  const embed = (await embedRes.json()) as {
    i?: string;
    t?: Array<{ i?: string }>;
  };
  return embed.i?.trim() || embed.t?.[0]?.i?.trim() || oembed.thumbnail_url?.trim() || null;
}

export const setMessageThumbnail = internalMutation({
  args: {
    id: v.id("messages"),
    thumbnailUrl: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    await ctx.db.patch(args.id, {
      thumbnailUrl: args.thumbnailUrl ?? undefined,
    });
  },
});

export const resolveMessageThumbnail = internalAction({
  args: {
    messageId: v.id("messages"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const url = args.url.trim();
    let thumbnailUrl: string | null = null;

    const ytId = youtubeVideoId(url);
    if (ytId) {
      thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    } else if (isRumbleUrl(url)) {
      try {
        thumbnailUrl = await resolveRumblePoster(url);
      } catch {
        thumbnailUrl = null;
      }
    }

    await ctx.runMutation(internal.mediaThumbnails.setMessageThumbnail, {
      id: args.messageId,
      thumbnailUrl,
    });
  },
});
