"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  {
    href: "/",
    label: "Imports",
    isActive: (path: string) =>
      path === "/" || path.startsWith("/imports") || path.startsWith("/requests"),
  },
  {
    href: "/products",
    label: "Products",
    isActive: (path: string) => path.startsWith("/products"),
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true" />
            Styled Shots
          </Link>
          <span className="brand-tag">Operator</span>
        </div>
        <nav className="side-nav">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="container">{children}</main>
    </div>
  );
}
