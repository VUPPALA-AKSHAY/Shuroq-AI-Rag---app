import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
export const HAS_BACKEND_API = Boolean(API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Disable GET request caching via timestamp cache-buster
  if (config.method?.toLowerCase() === "get") {
    config.params = {
      ...config.params,
      _t: Date.now(),
    };
  }
  return config;
});

// Refresh expired tokens.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && HAS_BACKEND_API) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refreshToken");

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });

          if (res.data?.ok && res.data?.data?.accessToken) {
            const { accessToken, refreshToken: newRefreshToken } = res.data.data;
            localStorage.setItem("accessToken", accessToken);
            if (newRefreshToken) localStorage.setItem("refreshToken", newRefreshToken);

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error("Session expired, logging out...", refreshError);
          localStorage.removeItem("authUser");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          window.location.reload();
        }
      }
    }

    return Promise.reject(error);
  }
);
