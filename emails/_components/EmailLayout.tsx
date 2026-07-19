import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { EVENT } from "../_lib/event";

const forest = "#1f3d2f";
const parchment = "#faf8f4";
const ink = "#1a1a1a";
const muted = "#5c5c5c";

type EmailLayoutProps = {
  preview: string;
  bannerUrl: string;
  children: ReactNode;
};

export function EmailLayout({ preview, bannerUrl, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Img
            src={bannerUrl}
            alt="Mountain of the Lord — The Homecoming"
            width="600"
            style={banner}
          />
          <Section style={content}>{children}</Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>{EVENT.fullTitle}</Text>
            <Text style={footerText}>
              {EVENT.dates} · {EVENT.venue}, {EVENT.location}
            </Text>
            <Text style={footerText}>
              Questions? {EVENT.supportEmail}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: parchment,
  fontFamily: "Georgia, 'Times New Roman', serif",
  margin: 0,
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e8e4dc",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "600px",
  overflow: "hidden",
};

const banner = {
  display: "block",
  width: "100%",
  maxWidth: "600px",
  height: "auto",
};

const content = {
  padding: "28px 32px",
};

const hr = {
  borderColor: "#e8e4dc",
  margin: "0",
};

const footer = {
  backgroundColor: forest,
  padding: "20px 32px",
};

const footerText = {
  color: "#f5f2ea",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 6px",
};

export const emailStyles = {
  heading: {
    color: forest,
    fontSize: "22px",
    fontWeight: 700,
    lineHeight: "28px",
    margin: "0 0 16px",
  } as const,
  paragraph: {
    color: ink,
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 14px",
  } as const,
  muted: {
    color: muted,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 10px",
  } as const,
  label: {
    color: muted,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    margin: "0 0 4px",
    textTransform: "uppercase" as const,
  },
  value: {
    color: ink,
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  listItem: {
    color: ink,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 6px",
  },
};
