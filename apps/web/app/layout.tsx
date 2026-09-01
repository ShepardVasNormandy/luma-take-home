import type { ReactNode } from "react";
import "./globals.css";

const faviconSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="9" fill="#f6f4ee" stroke="#2e5941" stroke-width="3.5"/><circle cx="20.5" cy="20.5" r="4.5" fill="#96432e"/></svg>',
  );

export const metadata = {
  title: "Styled Shots",
  description: "Shot ideas in, approved product photos out.",
  icons: { icon: faviconSvg },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
