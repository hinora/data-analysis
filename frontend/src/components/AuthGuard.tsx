/**
 * AuthGuard Component
 *
 * Wraps pages that require authentication. Redirects to /login if no token.
 */

import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { getToken } from "@/utils/auth";

interface AuthGuardProps {
  children: ReactNode;
}

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password"];

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const isPublicPath = PUBLIC_PATHS.includes(router.pathname);

    if (!token && !isPublicPath) {
      router.replace("/login");
    }

    if (token && isPublicPath) {
      router.replace("/sessions");
    }
  }, [router]);

  const token = getToken();
  const isPublicPath = PUBLIC_PATHS.includes(router.pathname);

  // Show nothing while redirecting
  if (!token && !isPublicPath) {
    return null;
  }

  return <>{children}</>;
}
