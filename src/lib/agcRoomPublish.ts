/**
 * The Rooms tab's publish menu speaks one string per scope so a single Select
 * can carry both directions: `publish:all`, `unpublish:type:hostel`,
 * `unpublish:building:Block A`. Parsing lives here, away from the component,
 * because the mapping is the part worth testing — a typo in a scope silently
 * publishing when you meant to hide a block would cost a full rep round trip.
 */

export type PublishScope = {
  publish: boolean;
  /** Every room, regardless of type or building. */
  all?: boolean;
  accommodationType?: string;
  building?: string;
};

const MODE = /^(publish|unpublish):/;

/**
 * Null for anything the menu would not produce, so a stale value can never
 * reach the mutation as a half-filled scope.
 */
export function parsePublishScope(value: string): PublishScope | null {
  const match = MODE.exec(value);
  if (!match) return null;
  const publish = match[1] === "publish";
  const rest = value.slice(match[0].length);

  if (rest === "all") return { publish, all: true };
  if (rest.startsWith("type:")) {
    const accommodationType = rest.slice("type:".length).trim();
    return accommodationType ? { publish, accommodationType } : null;
  }
  if (rest.startsWith("building:")) {
    // Building names may themselves contain colons; everything after the first
    // one is the name.
    const building = rest.slice("building:".length).trim();
    return building ? { publish, building } : null;
  }
  return null;
}

/** Wording for the toast, e.g. "Unpublish all Hostel rooms". */
export function publishScopeLabel(
  scope: PublishScope,
  typeLabel: (type: string) => string,
): string {
  const verb = scope.publish ? "Publish" : "Unpublish";
  if (scope.all) return `${verb} all rooms`;
  if (scope.accommodationType) {
    return `${verb} all ${typeLabel(scope.accommodationType)} rooms`;
  }
  if (scope.building) return `${verb} block — ${scope.building}`;
  return verb;
}
