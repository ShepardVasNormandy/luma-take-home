import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true" />
            Styled Shots
          </Link>
          <span className="brand-tag">Operator</span>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
