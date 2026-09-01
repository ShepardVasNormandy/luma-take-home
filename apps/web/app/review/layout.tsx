import type { ReactNode } from "react";
import type { Viewport } from "next";

export const metadata = {
  title: "Shot review",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
};

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return children;
}
