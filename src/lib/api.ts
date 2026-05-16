import { Student, AttendanceRecord, User, AppSettings, MealType } from '../types';

const API_BASE = '/api';

export const api = {
  getSettings: async (): Promise<AppSettings> => {
    const res = await fetch(`${API_BASE}/settings`);
    return res.json();
  },
  
  updateSettings: async (settings: AppSettings): Promise<void> => {
    await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },
  
  getStudents: async (): Promise<Student[]> => {
    const res = await fetch(`${API_BASE}/students`);
    return res.json();
  },
  
  updateStudents: async (students: Student[]): Promise<void> => {
    await fetch(`${API_BASE}/students/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students }),
    });
  },
  
  deleteStudent: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/students/${id}`, { method: 'DELETE' });
  },
  
  getAttendance: async (date?: string): Promise<AttendanceRecord[]> => {
    const url = date ? `${API_BASE}/attendance?date=${date}` : `${API_BASE}/attendance`;
    const res = await fetch(url);
    return res.json();
  },
  
  submitAttendance: async (records: AttendanceRecord[]): Promise<void> => {
    await fetch(`${API_BASE}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
  },
  
  getUsers: async (): Promise<User[]> => {
    const res = await fetch(`${API_BASE}/users`);
    return res.json();
  },
  
  register: async (user: any): Promise<void> => {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to register');
    }
  },
  
  login: async (credentials: any): Promise<User> => {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Invalid credentials');
    }
    return res.json();
  },
  
  deleteUser: async (username: string): Promise<void> => {
    await fetch(`${API_BASE}/users/${username}`, { method: 'DELETE' });
  }
};
