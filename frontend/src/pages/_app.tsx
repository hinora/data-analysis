import { QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import { getToken } from "@/utils/auth";
import { queryClient } from "@/utils/query";
import "@/styles/globals.css";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const isPublicPath = PUBLIC_PATHS.some(
      (path) => router.pathname === path,
    );

    if (!token && !isPublicPath) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </QueryClientProvider>
  );
}
