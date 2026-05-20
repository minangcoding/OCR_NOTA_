import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiBaseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 600000, // OCR AI and report exports can take time on local network/mobile testing
});

// Interceptor Request: Otomatis tambahkan token JWT ke header jika ada
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor Response: Tangani token expired / 401
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    // Jika 401 Unauthorized, hapus token dan tendang ke login
    useAuthStore.getState().logout();
    window.location.href = '/login';
  }
  return Promise.reject(error);
});

export default api;
