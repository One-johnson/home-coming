import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Download the "latin" subset woff2 files that Google serves for our two
// families, so the fonts can be self-hosted via next/font/local and the build
// no longer depends on network access to fonts.gstatic.com.
//
// Both families are variable fonts on Google Fonts: the latin woff2 is a single
// file covering the whole weight range, so we download one file per (family,
// style) and dedupe by URL.

const OUT_DIR = path.resolve("src/app/fonts");

// Modern Chrome UA so the CSS API returns woff2 (not ttf) URLs.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FAMILIES = [
  {
    slug: "CormorantGaramond",
    css: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,700;1,300;1,700&display=swap",
  },
  {
    slug: "Manrope",
    css: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;800&display=swap",
  },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Failed ${res.status} for ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Grab only the /* latin */ @font-face blocks and dedupe by (style, url).
function parseLatinFaces(css) {
  const seen = new Set();
  const faces = [];
  const regex = /\/\*\s*latin\s*\*\/\s*@font-face\s*{([^}]*)}/g;
  let m;
  while ((m = regex.exec(css)) !== null) {
    const body = m[1];
    const style = (body.match(/font-style:\s*([^;]+);/) || [])[1]?.trim() || "normal";
    const src = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1]?.trim();
    if (!src) continue;
    const key = `${style}|${src}`;
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push({ style, src });
  }
  return faces;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const fam of FAMILIES) {
    const css = await fetchText(fam.css);
    const faces = parseLatinFaces(css);
    if (faces.length === 0) throw new Error(`No latin faces found for ${fam.slug}`);

    for (const face of faces) {
      const suffix = face.style === "italic" ? "-Italic" : "";
      const filename = `${fam.slug}${suffix}.woff2`;
      const buf = await fetchBuffer(face.src);
      await writeFile(path.join(OUT_DIR, filename), buf);
      console.log(`saved ${filename} (${buf.length} bytes, style=${face.style})`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
