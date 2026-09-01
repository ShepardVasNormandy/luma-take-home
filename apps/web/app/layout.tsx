import type { ReactNode } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const faviconSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="20" height="20" fill="#191a1e"/><rect x="19" y="19" width="11" height="11" fill="#a6a8ad"/></svg>',
  );

export const metadata = {
  title: "Styled Shots",
  description: "Shot ideas in, approved product photos out.",
  icons: { icon: faviconSvg },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
