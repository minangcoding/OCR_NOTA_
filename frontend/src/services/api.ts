import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: `http://${window.location.hostname}:3000/api`, // Dynamically use the host IP for local network testing
  timeout: 60000, // 60 seconds timeout (OCR AI takes time to process images)
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
