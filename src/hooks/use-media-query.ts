"use client";

import * as React from "react";

/** True when viewport matches the media query. SSR-safe (false until mounted). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phone + tablet: prefer sheets over centered dialogs. */
export function useIsCompact() {
  return useMediaQuery("(max-width: 1023px)");
}
