import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every /admin route — console, sign-in, reset, register — uses the
  // chocolate-and-gold workspace theme (globals.css `.admin-theme`).
  return <div className="admin-theme contents">{children}</div>;
}
