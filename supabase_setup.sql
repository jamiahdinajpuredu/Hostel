-- Create tables for the Hostel Management System

-- 1. Users table (Extends Supabase Auth)
CREATE TABLE users (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Staff'
);

-- Enable RLS for users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all users" ON users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage users" ON users FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'Admin')
);

-- 2. Students table
CREATE TABLE students (
  student_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT,
  room_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view/manage students" ON students FOR ALL USING (auth.role() = 'authenticated');

-- 3. Attendance table
CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(student_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  recorded_by TEXT,
  UNIQUE(student_id, date, meal_type)
);

-- Enable RLS for attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view/manage attendance" ON attendance FOR ALL USING (auth.role() = 'authenticated');

-- 4. Settings table
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Enable RLS for settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view/manage settings" ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Initial Settings Data
INSERT INTO settings (key, value) VALUES ('config', '{"logoUrl": ""}') ON CONFLICT DO NOTHING;
