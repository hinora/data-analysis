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

export interface User {
  id: string;
  email: string;
  nickName: string;
  isActive: boolean;
  isVerified: boolean;
  photo: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProfileResponse extends User {
  createdAt: string;
  updatedAt: string;
}

// --- Query Keys ---

export const PROFILE_KEY = "auth/profile";

// --- Queries ---

export const useProfile = () => {
  const token = getToken();
  return useQuery({
    queryKey: [PROFILE_KEY],
    queryFn: async () => {
      const response = await service.get<ProfileResponse>("/auth/profile");
      return response.data;
    },
    enabled: !!token,
    retry: false,
  });
};

// --- Mutations ---

export const useLogin = () => {
  return useMutation({
    mutationFn: async (params: { email: string; password: string }) => {
      const response = await service.post<AuthResponse>("/auth/login", params);
      return response.data;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.invalidateQueries({ queryKey: [PROFILE_KEY] });
    },
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: async (params: {
      email: string;
      password: string;
      nickName: string;
    }) => {
      const response = await service.post<AuthResponse>(
        "/auth/register",
        params,
      );
      return response.data;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.invalidateQueries({ queryKey: [PROFILE_KEY] });
    },
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: async (params: { email: string }) => {
      const response = await service.post<{
        message: string;
        success: boolean;
      }>("/auth/forgot-password", params);
      return response.data;
    },
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (params: { password: string; token: string }) => {
      const response = await service.post<{
        message: string;
        success: boolean;
      }>("/auth/reset-password", params);
      return response.data;
    },
  });
};

export const useUpdateProfile = () => {
  return useMutation({
    mutationFn: async (params: { nickName?: string; photo?: string }) => {
      const response = await service.patch<ProfileResponse>(
        "/auth/profile",
        params,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILE_KEY] });
    },
  });
};

export const useLogout = () => {
  return useMutation({
    mutationFn: async () => {
      removeToken();
      queryClient.clear();
    },
  });
};
