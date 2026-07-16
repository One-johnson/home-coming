"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

function splitParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) =>
      // Also split single newlines when the editor used Enter once per paragraph
      part.includes("\n")
        ? part
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [part],
    );
}

type ExpandableTextProps = {
  text: string;
  /** Collapsed preview length in characters (across paragraphs). */
  previewChars?: number;
  className?: string;
  paragraphClassName?: string;
  /** Wrap the whole block (e.g. quote border). */
  wrapperClassName?: string;
  /** Optional leading/trailing quote marks around the visible text. */
  quoted?: boolean;
  buttonClassName?: string;
};

export function ExpandableText({
  text,
  previewChars = 280,
  className,
  paragraphClassName,
  wrapperClassName,
  quoted = false,
  buttonClassName,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = useMemo(() => splitParagraphs(text), [text]);

  const { visible, truncated } = useMemo(() => {
    if (expanded || paragraphs.length === 0) {
      return { visible: paragraphs, truncated: false };
    }

    const fullLength = paragraphs.join("\n\n").length;
    if (fullLength <= previewChars && paragraphs.length <= 2) {
      return { visible: paragraphs, truncated: false };
    }

    const result: string[] = [];
    let used = 0;

    for (const paragraph of paragraphs) {
      if (used >= previewChars) break;
      const remaining = previewChars - used;
      if (paragraph.length <= remaining) {
        result.push(paragraph);
        used += paragraph.length + 2;
      } else {
        const clipped = paragraph.slice(0, Math.max(remaining, 80)).trimEnd();
        result.push(`${clipped}…`);
        used = previewChars;
        break;
      }
    }

    if (result.length === 0 && paragraphs[0]) {
      result.push(`${paragraphs[0].slice(0, previewChars).trimEnd()}…`);
    }

    return { visible: result, truncated: true };
  }, [expanded, paragraphs, previewChars]);

  if (!text.trim()) return null;

  return (
    <div className={cn(wrapperClassName, className)}>
      <div className="space-y-4">
        {visible.map((paragraph, index) => {
          const isFirst = index === 0;
          const isLast = index === visible.length - 1;
          let content = paragraph;
          if (quoted && isFirst) content = `“${content}`;
          if (quoted && isLast) {
            if (truncated && !content.endsWith("…")) content = `${content}…`;
            content = `${content}”`;
          }

          return (
            <p
              key={`${index}-${paragraph.slice(0, 24)}`}
              className={paragraphClassName}
            >
              {content}
            </p>
          );
        })}
      </div>

      {truncated || expanded ? (
        <button
          type="button"
          className={cn(
            "mt-4 text-sm font-semibold tracking-wide underline-offset-4 hover:underline",
            buttonClassName,
          )}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
