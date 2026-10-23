/**
 * Paste-a-roster parser for the rep portal.
 *
 * Excel import needs a picked `.xlsx` file, which nobody does on a phone, so a
 * rep with a list of names in a chat message had to retype them one row at a
 * time. This parses a pasted block into guest drafts instead.
 *
 * Accepted per line (comma, tab, semicolon or pipe separated, any order):
 *
 *   Mr John Doe, M, Hostel
 *   1. Mrs Mary Mensah — female — EBPV — bishop rate
 *   Kwame Boateng
 *
 * The name is the only required part; gender, title, room type and the bishop
 * rate are picked up when present and defaulted when not. Kept pure so the
 * rules can be unit-tested without the React tree.
 */

export type PastedGuestDraft = {
  firstName: string;
  lastName: string;
  title: string;
  gender: "male" | "female";
  /** Matched accommodation type key, or null when the line named none. */
  accommodationType: string | null;
  isBishopRate: boolean;
};

export type ParsedRoster = {
  drafts: PastedGuestDraft[];
  /** Human-readable problems, one per line that could not be read. */
  errors: string[];
};

const TITLES = [
  "Bishop",
  "Rev.",
  "Pastor",
  "Elder",
  "Deacon",
  "Deaconess",
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Member",
];

/** Room-type words people actually type, mapped to the catalogue keys. */
const TYPE_ALIASES: Record<string, string> = {
  dormitory: "dormitory",
  dorm: "dormitory",
  dorms: "dormitory",
  "mighty fortress": "dormitory",
  fortress: "dormitory",
  hostel: "hostel",
  hostels: "hostel",
  blocks: "hostel",
  "wise as serpents": "wise_serpents",
  "wise serpents": "wise_serpents",
  serpents: "wise_serpents",
  "good general": "good_general",
  general: "good_general",
  ebpv: "ebpv",
  apartment: "ebpv",
  apartments: "ebpv",
};

const MALE = new Set(["m", "male", "man", "men", "boy", "brother", "b"]);
const FEMALE = new Set(["f", "female", "woman", "women", "girl", "sister", "s"]);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[._]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const matchTitle = (cell: string): string | null => {
  const normalized = normalize(cell);
  const hit = TITLES.find((title) => normalize(title) === normalized);
  return hit ?? null;
};

const matchType = (cell: string): string | null => {
  // Collapse the catalogue labels people paste in whole ("EBPV Apartment",
  // "Dormitory (Mighty Fortress)") onto their key.
  const normalized = normalize(cell)
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (TYPE_ALIASES[normalized]) return TYPE_ALIASES[normalized];
  for (const [alias, key] of Object.entries(TYPE_ALIASES)) {
    if (normalized.startsWith(`${alias} `)) return key;
  }
  return null;
};

/** Strip bullets and leading numbering ("1.", "2)", "-", "•"). */
const stripBullet = (line: string) =>
  line.replace(/^\s*(?:[-*•]+\s*)?(?:\d+\s*[.)]\s*)?/, "").trim();

export function parseRosterPaste(text: string): ParsedRoster {
  const drafts: PastedGuestDraft[] = [];
  const errors: string[] = [];

  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = stripBullet(rawLine);
    if (!line || line.startsWith("#")) return;

    const cells = line
      // Commas, tabs, semicolons, pipes and dashes all separate fields in
      // lists pasted from chats and spreadsheets.
      .split(/\t|,|;|\||—|–/)
      .map((cell) => cell.trim())
      .filter(Boolean);

    let title = "Member";
    let gender: "male" | "female" = "male";
    let accommodationType: string | null = null;
    let isBishopRate = false;
    const nameParts: string[] = [];

    for (const cell of cells) {
      // "(F)" and "M" mean the same thing in a pasted list.
      const bare = cell.replace(/^\((.*)\)$/, "$1").trim();
      const normalized = normalize(bare);
      const foundTitle = matchTitle(bare);
      if (foundTitle) {
        title = foundTitle;
        continue;
      }
      if (MALE.has(normalized)) {
        gender = "male";
        continue;
      }
      if (FEMALE.has(normalized)) {
        gender = "female";
        continue;
      }
      if (/^bishop(?:'s)? rate$/.test(normalized) || normalized === "br") {
        isBishopRate = true;
        continue;
      }
      const foundType = matchType(bare);
      if (foundType) {
        accommodationType = foundType;
        continue;
      }
      // A cell that carries a title inside a full name ("Mr John Doe").
      nameParts.push(cell);
    }

    let name = nameParts.join(" ").replace(/\s+/g, " ").trim();

    // "John Doe (M)" — a gender in brackets after the name.
    const trailingGender = name.match(/\s*\((m|f|male|female)\)\s*$/i);
    if (trailingGender) {
      const token = normalize(trailingGender[1]);
      if (FEMALE.has(token)) gender = "female";
      else if (MALE.has(token)) gender = "male";
      name = name.slice(0, trailingGender.index).trim();
    }

    if (!name) {
      errors.push(`Line ${index + 1}: no name found — add a first and last name.`);
      return;
    }

    // Titles glued to the name ("Mr. John Doe") are peeled off here.
    const words = name.split(" ");
    const leadingTitle = matchTitle(words[0]);
    if (leadingTitle) {
      title = leadingTitle;
      words.shift();
    }

    if (words.length === 0) {
      errors.push(`Line ${index + 1}: no name found after the title.`);
      return;
    }

    const firstName = words[0];
    const lastName = words.slice(1).join(" ");

    drafts.push({
      firstName,
      lastName,
      title,
      gender,
      accommodationType,
      isBishopRate,
    });

    if (!lastName) {
      errors.push(`Line ${index + 1}: add a last name for ${firstName}.`);
    }
  });

  return { drafts, errors };
}
