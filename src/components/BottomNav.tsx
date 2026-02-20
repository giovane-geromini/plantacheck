// src/components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
};

const items: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", match: (p) => p === "/" || p.startsWith("/dashboard") },
  { href: "/plants", label: "Plantas", icon: "🌿", match: (p) => p.startsWith("/plants") || p.startsWith("/planta") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";

  const wrap: React.CSSProperties = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    padding: "10px 12px calc(env(safe-area-inset-bottom) + 10px)",
    background: "rgba(246,247,249,0.92)",
    backdropFilter: "blur(10px)",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "#e6e8eb",
  };

  const bar: React.CSSProperties = {
    maxWidth: 460,
    margin: "0 auto",
    background: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e6e8eb",
    borderRadius: 16,
    boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
    padding: 8,
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
  };

  const itemBase: React.CSSProperties = {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 900,
    color: "#111",
    background: "#fff",
    textDecoration: "none",
    userSelect: "none",
  };

  const itemActive: React.CSSProperties = {
    background: "#111",
    color: "#fff",
    borderColor: "#111",
  };

  const iconStyle: React.CSSProperties = { fontSize: 18, lineHeight: "18px" };
  const labelStyle: React.CSSProperties = { fontSize: 12, letterSpacing: 0.2 };

  return (
    <nav style={wrap} aria-label="Navegação principal">
      <div style={bar}>
        {items.map((it) => {
          const isActive = it.match ? it.match(pathname) : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{ ...itemBase, ...(isActive ? itemActive : {}) }}
              aria-current={isActive ? "page" : undefined}
            >
              <span aria-hidden style={iconStyle}>
                {it.icon}
              </span>
              <span style={labelStyle}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}