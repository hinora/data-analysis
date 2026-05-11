/**
 * useAuth Hook
 *
 * Provides React Query hooks for authentication operations.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { getToken, removeToken, setToken } from "@/utils/auth";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";

// --- Types ---

export interface AuthUser {
  id: string;
  email: string;
  nickName: string;
  isActive: boolean;
  isVerified: boolean;
  photo?: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// --- Query Keys ---

export const AUTH_PROFILE_KEY = "auth/profile";

// --- Queries ---

export const useGetProfile = () => {
  const token = getToken();
  return useQuery({
    queryKey: [AUTH_PROFILE_KEY],
    queryFn: async () => {
      const response = await service.get<AuthUser>("/auth/profile");
      return response.data;
    },
    enabled: !!token,
    retry: false,
  });
};

// --- Mutations ---

export const useLogin = () => {
  return useMutation({
    mutationFn: async (params: {
      email: string;
      password: string;
    }): Promise<AuthResponse> => {
      const response = await service.post<AuthResponse>("/auth/login", params);
      return response.data;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.invalidateQueries({ queryKey: [AUTH_PROFILE_KEY] });
    },
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: async (params: {
      email: string;
      password: string;
      nickName: string;
    }): Promise<AuthResponse> => {
      const response = await service.post<AuthResponse>(
        "/auth/register",
        params,
      );
      return response.data;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.invalidateQueries({ queryKey: [AUTH_PROFILE_KEY] });
    },
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (params: {
      email: string;
    }): Promise<{ success: boolean; message: string }> => {
      const response = await service.post<{
        success: boolean;
        message: string;
      }>("/auth/forgot-password", params);
      return response.data;
    },
  });
};

export const useUpdateProfile = () => {
  return useMutation({
    mutationFn: async (params: {
      nickName?: string;
      photo?: string;
    }): Promise<AuthUser> => {
      const response = await service.put<AuthUser>("/auth/profile", params);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AUTH_PROFILE_KEY] });
    },
  });
};

export const useLogout = () => {
  return {
    logout: () => {
      removeToken();
      queryClient.clear();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    },
  };
};
