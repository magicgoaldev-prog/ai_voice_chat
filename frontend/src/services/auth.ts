import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthResponse {
  token: string;
  user: GoogleUserInfo;
}

export async function loginWithGoogle(userInfo: GoogleUserInfo): Promise<AuthResponse> {
  try {
    const response = await axios.post<AuthResponse>(
      `${API_BASE_URL}/auth/google`,
      { userInfo }
    );

    // Store token in localStorage
    localStorage.setItem('authToken', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));

    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
}

export function getToken(): string | null {
  return localStorage.getItem('authToken');
}

export function getUser(): GoogleUserInfo | null {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
