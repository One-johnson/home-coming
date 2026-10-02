import { NextResponse, type NextRequest } from "next/server";

/**
 * The public accommodation (campus housing) page was removed — accommodation
 * is now booked exclusively through the rep portal by hub representatives.
 * Legacy links redirect to the homepage (permanent) and the preferred-hotels
 * list lives on /tours. (Next.js 16: `proxy.ts` replaces `middleware.ts`.)
 */
export default function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), 308);
}

export const config = {
  matcher: ["/accommodation", "/accommodation/:path*"],
};
