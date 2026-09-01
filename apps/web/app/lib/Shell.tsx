import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link href="/" className="brand">
            Styled Shots
          </Link>
          <span className="brand-tag">Operator</span>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
