export interface Student {
  studentId: string;
  name: string;
  roomNumber: string;
  className: string;
}

export interface User {
  username: string;
  name: string;
  role: 'Admin' | 'Staff';
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';

export interface AttendanceRecord {
  studentId: string;
  date: string;
  mealType: MealType;
  status: 'Present' | 'Absent';
  timestamp?: string;
  recordedBy?: string;
}

export interface DayAttendance {
  [studentId: string]: {
    [meal in MealType]?: 'Present' | 'Absent';
  }
}

export interface AppSettings {
  logoUrl: string;
}
