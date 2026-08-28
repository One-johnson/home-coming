import { Section } from "@/components/ui/Section";
import { Separator } from "@/components/ui/separator";
import { aboutContent } from "@/lib/siteContent";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-3xl font-normal text-gold-dark md:text-4xl">
      {children}
    </h3>
  );
}

function GoldList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-gold"
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChurchAbout() {
  const { church } = aboutContent;

  return (
    <Section
      className="bg-cream pt-24"
      subtitle={church.subtitle}
      title={church.title}
    >
      <div className="mx-auto max-w-5xl space-y-10 text-lg leading-relaxed text-soft-ink md:text-xl md:leading-relaxed">
        <div className="space-y-4">
          {church.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>

        {church.sections.map((section) => (
          <div key={section.heading}>
            <Separator className="mb-10" />
            <Heading>{section.heading}</Heading>
            {section.intro ? <p className="mt-4">{section.intro}</p> : null}
            {section.items ? <GoldList items={section.items} /> : null}
            {section.paragraphs?.length ? (
              <div
                className={
                  section.intro || section.items ? "mt-6 space-y-4" : "mt-4 space-y-4"
                }
              >
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
              </div>
            ) : null}
            {section.quote ? (
              <p className="lead mt-6 border-l-2 border-gold pl-6 text-xl not-italic md:text-2xl">
                {section.quote}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
