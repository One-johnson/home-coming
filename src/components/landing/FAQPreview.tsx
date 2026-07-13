"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";

type FaqItem = { _id: string; question: string; answer: string };

function FAQPreviewContent({ preview }: { preview: FaqItem[] }) {
  return (
    <Section subtitle="Questions" title="Frequently Asked Questions">
      <Accordion className="mx-auto max-w-4xl space-y-4">
        {preview.map((faq) => (
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
      {!preview.length && (
        <p className="text-center text-base text-muted-foreground md:text-lg">
          FAQs will appear once Convex is connected.
        </p>
      )}
      <p className="mt-8 text-center text-base text-muted-foreground md:text-lg">
        Need more help? Email{" "}
        <a
          href={`mailto:${EVENT.supportEmail}`}
          className="font-medium text-primary hover:underline"
        >
          {EVENT.supportEmail}
        </a>
      </p>
      <div className="mt-6 text-center">
        <Button href="/faqs" variant="outline">
          View All FAQs
        </Button>
      </div>
    </Section>
  );
}

function FAQPreviewConnected() {
  const faqs = useQuery(api.content.listFaqs);
  return <FAQPreviewContent preview={faqs?.slice(0, 4) ?? []} />;
}

export function FAQPreview() {
  if (!isConvexConfigured()) {
    return <FAQPreviewContent preview={[]} />;
  }
  return <FAQPreviewConnected />;
}
