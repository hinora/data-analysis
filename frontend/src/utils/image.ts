const API_ENDPOINT = process.env.BASE_API ?? "http://localhost:3000/api";

export function buildImageUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }

  // If URL already contains http, return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Remove /api from the base URL to get the root endpoint
  const baseUrl = API_ENDPOINT.replace(/\/api\/?$/, "");

  // Ensure the url starts with /
  const path = url.startsWith("/") ? url : `/${url}`;

  return `${baseUrl}${path}`;
}
