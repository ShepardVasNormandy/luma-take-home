import type { ReactNode } from "react";

export const metadata = {
  title: "Styled Shots",
  description: "Shot ideas in, approved product photos out.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
