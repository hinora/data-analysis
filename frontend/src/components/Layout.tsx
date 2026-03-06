import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const navItems = [{ href: "/sessions", label: "Sessions" }];

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <Link
            href="/"
            style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}
          >
            Data Analysis
          </Link>
          <nav style={{ display: "flex", gap: 16 }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: 14,
                  color:
                    router.pathname === item.href ||
                    router.pathname.startsWith(item.href)
                      ? "#2563eb"
                      : "#4b5563",
                  fontWeight:
                    router.pathname === item.href ||
                    router.pathname.startsWith(item.href)
                      ? 500
                      : 400,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}
