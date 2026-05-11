import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useGetProfile, useLogout } from "@/hooks/useAuth";

interface LayoutProps {
  children: ReactNode;
}

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password"];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(router.pathname);
  const { data: user } = useGetProfile();
  const { logout } = useLogout();

  const navItems = [{ href: "/sessions", label: "Sessions" }];

  // Don't show header on auth pages
  if (isPublicPath) {
    return <>{children}</>;
  }

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
          <nav style={{ display: "flex", gap: 16, flex: 1 }}>
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
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link href="/profile" style={{ fontSize: 14, color: "#4b5563" }}>
                {user.nickName}
              </Link>
              <button
                type="button"
                onClick={logout}
                style={{
                  fontSize: 13,
                  color: "#dc2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      <main style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}
