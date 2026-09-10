import Link from "next/link";
import { cn } from "@/lib/utils";

export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocumentContent = {
  title: string;
  subtitle: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

function linkifyText(text: string) {
  const parts = text.split(
    /(paystackloyaltyhouse@gmail\.com|www\.dataprotection\.org\.gh|homecomingconvention\.com)/g,
  );

  return parts.map((part, index) => {
    if (part === "paystackloyaltyhouse@gmail.com") {
      return (
        <a
          key={index}
          href="mailto:paystackloyaltyhouse@gmail.com"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {part}
        </a>
      );
    }

    if (part === "www.dataprotection.org.gh") {
      return (
        <a
          key={index}
          href="https://www.dataprotection.org.gh"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {part}
        </a>
      );
    }

    if (part === "homecomingconvention.com") {
      return (
        <Link
          key={index}
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {part}
        </Link>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.type === "paragraph") {
    return (
      <p className="font-body text-base leading-relaxed text-body md:text-lg">
        {linkifyText(block.text)}
      </p>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="list-disc space-y-3 pl-5 font-body text-base leading-relaxed text-body md:text-lg">
        {block.items.map((item) => (
          <li key={item}>{linkifyText(item)}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left font-body text-sm md:text-base">
        <thead className="bg-muted/60">
          <tr>
            {block.headers.map((header) => (
              <th
                key={header}
                className="border-b border-border px-4 py-3 font-semibold text-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${cellIndex}-${cell}`}
                  className="border-b border-border px-4 py-3 text-body last:border-b-0"
                >
                  {linkifyText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalDocument({
  content,
  className,
}: {
  content: LegalDocumentContent;
  className?: string;
}) {
  return (
    <article className={cn("mx-auto max-w-3xl", className)}>
      <header className="mb-10 border-b border-border pb-8 text-center">
        <p className="eyebrow mb-4">{content.subtitle}</p>
        <h1 className="font-display text-4xl font-normal tracking-tight text-foreground md:text-5xl">
          {content.title}
        </h1>
        <div className="ornament mt-6" aria-hidden>
          <span className="ornament-diamond" />
        </div>
        <p className="mt-6 font-body text-sm text-muted-foreground md:text-base">
          Effective date: {content.effectiveDate}
          <span className="mx-2 text-border" aria-hidden>
            ·
          </span>
          Last updated: {content.lastUpdated}
        </p>
      </header>

      <div className="space-y-10">
        <p className="font-body text-base leading-relaxed text-body md:text-lg">
          {linkifyText(content.intro)}
        </p>

        {content.sections.map((section) => (
          <section key={section.heading} className="space-y-4">
            <h2 className="font-display text-2xl text-primary md:text-3xl">
              {section.heading}
            </h2>
            <div className="space-y-4">
              {section.blocks.map((block, index) => (
                <LegalBlockView
                  key={`${section.heading}-${block.type}-${index}`}
                  block={block}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
