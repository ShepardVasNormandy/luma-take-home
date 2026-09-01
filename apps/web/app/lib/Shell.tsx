"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "./api";

const NAV = [
  {
    href: "/",
    label: "Imports",
    isActive: (path: string) =>
      path === "/" || path.startsWith("/imports") || path.startsWith("/requests"),
    icon: (
      <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="15" height="15" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 11.5v-2M9 11.5V6.5M12.5 11.5V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/products",
    label: "Products",
    isActive: (path: string) => path.startsWith("/products"),
    icon: (
      <svg className="nav-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M9 1.8 15.8 5.4v7.2L9 16.2 2.2 12.6V5.4L9 1.8Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M2.5 5.5 9 9l6.5-3.5M9 9v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await api("/auth/logout", { method: "POST", body: {} });
    router.push("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand-block">
          <span className="brand-mark2" aria-hidden="true" />
          <span className="brand-word">
            Styled
            <br />
            Shots
          </span>
        </Link>
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
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {menuOpen ? (
            <div className="user-menu">
              <button onClick={() => void signOut()}>Sign out</button>
            </div>
          ) : null}
          <button
            className="sidebar-user"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
          >
            <span className="avatar">O</span>
            <span className="who">
              <span className="name">Operator</span>
              <br />
              <span className="role">Styled Shots</span>
            </span>
          </button>
        </div>
      </aside>
      <main className="container">{children}</main>
    </div>
  );
}
