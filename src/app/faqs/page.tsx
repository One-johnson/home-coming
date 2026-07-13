"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";

type Faq = { _id: string; category: string; question: string; answer: string };

function FAQsPageContent({ faqs }: { faqs: Faq[] }) {
  const categories = [...new Set(faqs.map((f) => f.category))];

  return (
    <Section
      subtitle="Help Center"
      title="Frequently Asked Questions"
      className="pt-24"
    >
      <div className="mx-auto max-w-4xl space-y-10">
        {categories.map((category) => (
          <div key={category}>
            <h2 className="mb-5 font-display text-3xl text-primary">{category}</h2>
            <Accordion className="space-y-4">
              {faqs
                .filter((f) => f.category === category)
                .map((faq) => (
                  <AccordionItem key={faq._id} value={faq._id} className="rounded-xl border px-5 py-1">
                    <AccordionTrigger className="py-4 text-lg font-semibold text-primary hover:no-underline md:text-xl">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base leading-relaxed text-body md:text-lg">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          </div>
        ))}
        {!faqs.length && (
          <p className="text-center text-base text-muted-foreground md:text-lg">
            FAQs will appear once Convex is connected. Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">npx convex dev</code>.
          </p>
        )}
      </div>

      <p className="mt-12 text-center text-base text-muted-foreground md:text-lg">
        Still have questions? Contact us at{" "}
        <a
          href={`mailto:${EVENT.supportEmail}`}
          className="font-medium text-primary hover:underline"
        >
          {EVENT.supportEmail}
        </a>
      </p>
    </Section>
  );
}

function FAQsPageConnected() {
  const faqs = useQuery(api.content.listFaqs);
  return <FAQsPageContent faqs={faqs ?? []} />;
}

export default function FAQsPage() {
  if (!isConvexConfigured()) {
    return <FAQsPageContent faqs={[]} />;
  }
  return <FAQsPageConnected />;
}
