const fs = require("fs");

/** Preserve first-seen group order from the CSV (document order). */
const GROUP_ORDER = [
  "Ghana",
  "West Africa",
  "UD Africa",
  "UD EU",
  "UD EU - UK",
  "UD EU - Switzerland",
  "UD North America",
  "United Islands",
  "United Jesus",
  "Eschatos International",
  "Reasonable Service Church",
  "Affiliated Denominations",
];

const lines = fs
  .readFileSync("data/groups-denominations.csv", "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1);

const byGroup = new Map();
for (const line of lines) {
  const i = line.lastIndexOf(",");
  if (i < 0) continue;
  const d = line.slice(0, i).trim().replace(/\s+/g, " ");
  const g = line.slice(i + 1).trim().replace(/\s+/g, " ");
  if (!d || !g) continue;
  if (!byGroup.has(g)) byGroup.set(g, []);
  if (!byGroup.get(g).includes(d)) byGroup.get(g).push(d);
}

const groups = [
  ...GROUP_ORDER.filter((g) => byGroup.has(g)),
  ...[...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g)),
];

const q = (s) => JSON.stringify(s);

let out = `/**
 * Official Group / Denomination-Country-Hub lists sourced from
 * DOCUMENTS FOR HOMECOMING (updated).
 * Regenerate with: node scripts/generate-groups-denominations.cjs
 */

export const GROUP_OPTIONS = [
`;

for (const g of groups) out += `  ${q(g)},\n`;
out += `  "Other",
] as const;

export const DENOMINATIONS_BY_GROUP: Record<string, readonly string[]> = {
`;

for (const g of groups) {
  out += `  ${q(g)}: [\n`;
  for (const d of byGroup.get(g)) out += `    ${q(d)},\n`;
  if (g !== "Affiliated Denominations") out += `    "Other",\n`;
  out += `  ],\n`;
}
out += `  Other: ["Other"],
};

/** Flat list of all denominations / countries / hubs (plus Other) for filters. */
export const DENOMINATION_OPTIONS = [
`;
const allDenoms = [...new Set([...byGroup.values()].flat())].sort((a, b) =>
  a.localeCompare(b),
);
for (const d of allDenoms) {
  if (d === "Other") continue;
  out += `  ${q(d)},\n`;
}
out += `  "Other",
] as const;

/**
 * Selecting an official group other than Other
 * means Church / Ministry Affiliation is optional / hidden.
 */
export const UD_FIRST_LOVE_DENOMINATION = "FIRST LOVE CHURCH";
`;

fs.writeFileSync("src/lib/groupsDenominations.ts", out);
console.log(`Wrote ${groups.length} groups, ${allDenoms.length} denominations`);
