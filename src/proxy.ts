import { NextResponse, type NextRequest } from "next/server";

/**
 * The public accommodation (campus housing) page was removed — accommodation
 * is now booked exclusively through the rep portal by hub representatives.
 * Legacy deep links still redirect to the homepage (permanent); the root
 * /accommodation URL is now the Accommodation team's sign-in route, so it is
 * excluded here. (Next.js 16: `proxy.ts` replaces `middleware.ts`.)
 */
export default function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), 308);
}

export const config = {
  // `:path+` needs at least one segment, so the bare /accommodation URL is
  // left to the Accommodation team sign-in route.
  matcher: ["/accommodation/:path+"],
};
