import axios from "axios";
import { getToken, removeToken } from "./auth";

// create an axios instance
const service = axios.create({
  baseURL: process.env.BASE_API ?? "http://localhost:3000/api",
  timeout: 600000,
});

// request interceptor
service.interceptors.request.use(
  (config) => {
    config.headers = config.headers ?? {};

    // Attach JWT token to every request
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (!config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  },
  (error) => {
    console.log(error);
    return Promise.reject(error);
  },
);

// response interceptor
service.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      // Redirect to login on auth failure (only in browser)
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export { service };
