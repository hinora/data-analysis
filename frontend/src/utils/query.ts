import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // make retry behavior the same with redux
      retry: false,
    },
    mutations: {},
  },
});
