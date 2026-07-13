"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { isConvexConfigured } from "@/lib/convex-config";

function SeedInitializerInner() {
  const faqs = useQuery(api.content.listFaqs);
  const seedPublic = useMutation(api.seed.seedPublic);
  const attempted = useRef(false);

  useEffect(() => {
    if (faqs === undefined || attempted.current) return;
    if (faqs.length === 0) {
      attempted.current = true;
      seedPublic().catch(() => {
        attempted.current = false;
      });
    }
  }, [faqs, seedPublic]);

  return null;
}

export function SeedInitializer() {
  if (!isConvexConfigured()) return null;
  return <SeedInitializerInner />;
}
