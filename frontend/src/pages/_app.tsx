import { QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import Layout from "@/components/Layout";
import { queryClient } from "@/utils/query";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </QueryClientProvider>
  );
}
