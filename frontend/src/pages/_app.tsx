import { QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import AuthGuard from "@/components/AuthGuard";
import Layout from "@/components/Layout";
import { queryClient } from "@/utils/query";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AuthGuard>
    </QueryClientProvider>
  );
}
