/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Users, 
  Calendar, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  ChevronLeft,
  LayoutDashboard,
  Search,
  UsersRound,
  FileText,
  LogOut,
  FileCheck2,
  UserCircle2,
  FileBarChart2,
  Settings,
  LineChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc,
  getDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { db, auth, adminAuth } from './lib/firebase';
import { Student, AttendanceRecord, MealType, User, AppSettings } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('hostel_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState<'attendance' | 'students' | 'reports' | 'users' | 'dashboard'>('dashboard');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ logoUrl: '' });
  const [draftAttendance, setDraftAttendance] = useState<{ [id: string]: { status: 'Present' | 'Absent', timestamp?: string } }>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Lunch');
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('All');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Manual Student Entry State
  const [studentForm, setStudentForm] = useState({ studentId: '', name: '', className: '', roomNumber: '' });

  // Login States
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', role: 'Staff' as 'Admin' | 'Staff' | 'Viewer' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setCurrentUser(userData);
        localStorage.setItem('hostel_user', JSON.stringify(userData));
        setView('dashboard');
      } else if (result.user.email === 'jamiahdinajpur.edu@gmail.com') {
        const newUser: User = { 
          username: 'admin', 
          name: result.user.displayName || 'Admin', 
          role: 'Admin' 
        };
        await setDoc(doc(db, 'users', result.user.uid), newUser);
        setCurrentUser(newUser);
        localStorage.setItem('hostel_user', JSON.stringify(newUser));
      } else {
        alert("আপনার ইমেইলটি অনুমোদিত নয়।");
        await signOut(auth);
      }
    } catch (err: any) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      // Using firebase-based login
      // Mapping username to pseudo-email for Firebase Auth
      const email = `${authForm.username.toLowerCase()}@hostel.internal`;
      const userCredential = await signInWithEmailAndPassword(auth, email, authForm.password);
      
      // Get user details from Firestore
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setCurrentUser(userData);
        localStorage.setItem('hostel_user', JSON.stringify(userData));
        setView('dashboard');
      } else {
        // Fallback or legacy check (if user exists in auth but not in firestore)
        alert("User record not found in database.");
      }
    } catch (err: any) {
      console.error(err);
      alert("ভুল ইউজারনেম বা পাসওয়ার্ড!");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const email = `${authForm.username.toLowerCase()}@hostel.internal`;
      // Use adminAuth (secondary instance) to create user so primary auth (admin) stays logged in
      const userCredential = await createUserWithEmailAndPassword(adminAuth, email, authForm.password);
      
      const newUser: User = { 
        username: authForm.username, 
        name: authForm.name, 
        role: authForm.role || 'Staff' 
      };

      // Now we use the primary 'db' instance. 
      // Since the primary 'auth' instance (the one used by 'db') is still logged in as Admin,
      // the security rules will allow this write.
      await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
      
      // We should sign out the user from the SECONDARY instance to keep it clean
      await signOut(adminAuth);
      
      alert("ইউজার তৈরি সফল!");
      setAuthForm({ username: '', password: '', name: '', role: 'Staff' });
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        alert("এই ইউজারনেমটি (Username) ইতিমধ্যে ব্যবহার করা হয়েছে। দয়া করে অন্য একটি ইউজারনেম চেষ্টা করুন। যদি আপনি এই ইউজারটি আগে ডিলিট করে থাকেন, তবে Firebase Console থেকে তাকে পুরোপুরি রিমুভ করতে হবে।");
      } else {
        alert(err.message || "ব্যর্থ হয়েছে!");
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    localStorage.removeItem('hostel_user');
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm("Are you sure you want to delete this user? (Auth record must be deleted manually in Firebase Console)")) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      alert("ইউজার ডাটা ডিলিট সফল!");
    } catch (err) {
      alert("ডিলিট ব্যর্থ হয়েছে।");
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.studentId || !studentForm.name || !studentForm.className || !studentForm.roomNumber) {
      alert("সবগুলো ঘর পূরণ করুন।");
      return;
    }
    try {
      await setDoc(doc(db, 'students', studentForm.studentId.trim()), {
        ...studentForm,
        studentId: studentForm.studentId.trim()
      });
      alert("ছাত্র যোগ করা সফল হয়েছে!");
      setStudentForm({ studentId: '', name: '', className: '', roomNumber: '' });
    } catch (err: any) {
      console.error(err);
      alert("ব্যর্থ হয়েছে: " + err.message);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm("আপনি কি নিশ্চিতভাবে এই ছাত্রের তথ্য ডিলিট করতে চান?")) return;
    try {
      await deleteDoc(doc(db, 'students', id));
      alert("ছাত্র ডিলিট সফল!");
    } catch (err) {
      alert("ডিলিট ব্যর্থ হয়েছে।");
    }
  };

  // Sorted students for database view
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  }, [students]);

  // Load initial data and Sync with Firebase
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setCurrentUser(userData);
          localStorage.setItem('hostel_user', JSON.stringify(userData));
        }
      } else {
        setCurrentUser(null);
        localStorage.removeItem('hostel_user');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    
    // Students listener
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as Student);
      setStudents(data);
    });

    // Attendance listener for selected date
    const attendanceQuery = query(collection(db, 'attendance'), where('date', '==', selectedDate));
    const unsubAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const data = snapshot.docs.map(d => d.data() as AttendanceRecord);
      setAttendance(data);
      setIsLoading(false);
    });

    // Settings listener
    const unsubSettings = onSnapshot(doc(db, 'settings', 'config'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as AppSettings);
      }
    });

    // Users listener (Admin only)
    let unsubUsers = () => {};
    if (currentUser.role === 'Admin') {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const data = snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as User & { uid: string }));
        setUsers(data as any);
      });
    }

    return () => {
      unsubStudents();
      unsubAttendance();
      unsubSettings();
      unsubUsers();
    };
  }, [selectedDate, currentUser]);

  // Sync draft from existing attendance when switching meal
  useEffect(() => {
    if (!currentUser || isLoading) return;
    const mealAttendance = attendance.filter(a => a.mealType === selectedMeal);
    if (mealAttendance.length > 0) {
      const drafts: { [id: string]: { status: 'Present' | 'Absent', timestamp?: string } } = {};
      mealAttendance.forEach(a => drafts[a.studentId] = { status: a.status, timestamp: a.timestamp });
      setDraftAttendance(drafts);
      setIsEditMode(false);
    } else {
      setDraftAttendance({});
      setIsEditMode(true);
    }
  }, [selectedMeal, attendance, currentUser, isLoading]);

  // Dashboard Calculations
  const dashboardStats = useMemo(() => {
    const totalStudents = students.length;
    
    const roomStats: { [room: string]: { total: number, present: number, absent: number } } = {};
    
    students.forEach(s => {
      const roomNum = s.roomNumber;
      if (!roomStats[roomNum]) {
        roomStats[roomNum] = { total: 0, present: 0, absent: 0 };
      }
      roomStats[roomNum].total++;
      
      const record = attendance.find(a => a.studentId === s.studentId && a.mealType === selectedMeal);
      if (record?.status === 'Present') {
        roomStats[roomNum].present++;
      } else if (record?.status === 'Absent') {
        roomStats[roomNum].absent++;
      }
    });

    const allRoomEntries = Object.entries(roomStats).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    
    // Global summary stays global
    const totalPresent = allRoomEntries.reduce((sum, [, r]) => sum + r.present, 0);
    const totalAbsent = allRoomEntries.reduce((sum, [, r]) => sum + r.absent, 0);
    const totalRecorded = totalPresent + totalAbsent;
    const attendancePercentage = totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;

    // Only filter the room stats list for "রুম ভিত্তিক রিপোর্ট"
    const filteredRoomEntries = roomFilter === 'All' 
      ? allRoomEntries 
      : allRoomEntries.filter(([room]) => room === roomFilter);

    return {
      totalStudents,
      roomStats: filteredRoomEntries,
      totalPresent,
      totalAbsent,
      totalRecorded,
      attendancePercentage
    };
  }, [students, attendance, selectedMeal, roomFilter]);

  // Group students by room
  const studentsByRoom = useMemo(() => {
    const grouped: { [room: string]: Student[] } = {};
    students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              s.studentId.includes(searchQuery);
        const matchesRoom = roomFilter === 'All' || s.roomNumber === roomFilter;
        return matchesSearch && matchesRoom;
      })
      .forEach(s => {
        if (!grouped[s.roomNumber]) grouped[s.roomNumber] = [];
        grouped[s.roomNumber].push(s);
      });
    return grouped;
  }, [students, searchQuery, roomFilter]);

  const rooms = useMemo(() => {
    const r = (Array.from(new Set(students.map(s => s.roomNumber))) as string[]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ['All', ...r];
  }, [students]);

  // Stats for the current view
  const currentStudents: Student[] = (Object.values(studentsByRoom) as Student[][]).flat();
  const presentCount = currentStudents.filter(s => draftAttendance[s.studentId]?.status === 'Present').length;
  const absentCount = currentStudents.filter(s => draftAttendance[s.studentId]?.status === 'Absent').length;

  // Add this state to check if system is initialized
  const [systemEmpty, setSystemEmpty] = useState(false);

  useEffect(() => {
    const checkInit = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'Admin'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          setSystemEmpty(true);
        } else {
          setSystemEmpty(false);
        }
      } catch (e: any) {
        // If we get a permission error, it's likely rules are still propagating or there's a config issue
        console.warn("Check init failed (likely propagation):", e.message);
        if (e.message.includes('insufficient permissions')) {
          // Assume not empty to allow login attempts while rules propagate
          setSystemEmpty(false);
        }
      }
    };
    checkInit();
  }, []);

  const initializeAdmin = async () => {
    try {
      const email = "admin@hostel.internal";
      const userCredential = await createUserWithEmailAndPassword(auth, email, "admin123");
      
      const newUser: User = { 
        username: 'admin', 
        name: 'Admin User', 
        role: 'Admin' 
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
      
      alert("System Initialized! You can now login with admin / admin123");
      setSystemEmpty(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        alert("ভুল: Firebase Console এ 'Email/Password' অথেনটিকেশন এনাবল করা নেই। অনুগ্রহ করে Firebase কনসোল থেকে Authentication > Sign-in method এ গিয়ে Email/Password এনাবল করুন।");
      } else {
        alert("Initialization failed: " + err.message);
      }
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
        <style>{`
          @import url('https://cdn.jsdelivr.net/gh/maateen/solaimanlipi@master/solaimanlipi.css');
          * { font-family: 'SolaimanLipi', sans-serif !important; }
        `}</style>
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative z-10"
        >
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-950 p-10 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-400 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl" />
            </div>
            
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center font-black text-4xl mx-auto mb-6 text-white border border-white/30 shadow-2xl overflow-hidden">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span>D</span>
                )}
              </div>
              <h1 className="text-3xl font-black tracking-tight mb-2">বোডিং রুম</h1>
              <p className="text-[10px] text-indigo-300 uppercase font-black tracking-[0.3em] opacity-80">Institutional Entry System</p>
            </div>
          </div>
          
          <div className="p-8 lg:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-black text-slate-800 mb-1">স্বাগতম!</h2>
              <p className="text-sm font-medium text-slate-400">আপনার একাউন্টে লগইন করুন</p>
            </div>

            {systemEmpty ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  <p className="text-xs text-amber-800 font-bold leading-relaxed">
                    সিস্টেমটি এখনো সক্রিয় করা হয়নি। প্রথমবার ব্যবহারের জন্য এডমিন একাউন্ট তৈরি করুন।
                  </p>
                </div>
                <button 
                  onClick={initializeAdmin}
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                >
                  সিস্টেম সক্রিয় করুন (Init Admin)
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block ml-1">ইউজারনেম (Username)</label>
                  <input 
                    required
                    type="text" 
                    value={authForm.username}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-slate-700"
                    placeholder="আপনার আইডি দিন"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block ml-1">পাসওয়ার্ড (Password)</label>
                  <input 
                    required
                    type="password" 
                    value={authForm.password}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold text-slate-700"
                    placeholder="আপনার পাসওয়ার্ড"
                  />
                </div>
                <button 
                  disabled={isLoggingIn}
                  className="w-full bg-indigo-600 text-white py-5 rounded-xl font-black shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  {isLoggingIn ? "প্রসেসিং..." : "লগইন করুন"}
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold"><span className="bg-white px-2 text-slate-400">অথবা</span></div>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full bg-white border border-slate-200 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  <img src="https://www.gstatic.com/firebase/anonymous-scan/94c8e76f5b/google.svg" alt="Google" className="w-5 h-5" />
                  গুগল দিয়ে লগইন
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-indigo-600 text-lg font-black animate-pulse">প্রসেসিং হচ্ছে...</p>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">দয়া করে অপেক্ষা করুন</p>
          </div>
        </div>
      </div>
    );
  }

  const canRecordAttendance = currentUser?.role === 'Admin' || currentUser?.role === 'Staff';

  const handleStatusChange = (studentId: string, status: 'Present' | 'Absent') => {
    if (!canRecordAttendance) {
      alert("আপনার এই কাজটি করার অনুমতি নেই।");
      return;
    }
    if (!isEditMode) {
      alert("পরিবর্তন করতে প্রথমে 'আপডেট হাজিরা' বাটনে ক্লিক করুন।");
      return;
    }
    const now = new Date();
    const timeString = now.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
    
    setDraftAttendance(prev => ({
      ...prev,
      [studentId]: { status, timestamp: timeString }
    }));
  };

  const handleSubmitAttendance = async () => {
    if (!canRecordAttendance) {
      alert("আপনার এই কাজটি করার অনুমতি নেই।");
      return;
    }
    const records = (Object.entries(draftAttendance) as [string, { status: 'Present' | 'Absent', timestamp?: string }][]).map(([studentId, data]) => ({
      studentId,
      date: selectedDate,
      mealType: selectedMeal,
      status: data.status,
      timestamp: data.timestamp,
      recordedBy: currentUser?.username,
      updatedAt: serverTimestamp()
    }));

    if (records.length === 0) {
      alert("কোনো হাজিরা রেকর্ড করা হয়নি।");
      return;
    }

    try {
      const batch = writeBatch(db);
      records.forEach(record => {
        // ID: date_meal_studentId
        const id = `${record.date}_${record.mealType}_${record.studentId}`;
        batch.set(doc(db, 'attendance', id), record);
      });
      await batch.commit();
      setIsEditMode(false);
      alert("হাজিরা সফলভাবে সাবমিট করা হয়েছে!");
    } catch (error) {
      console.error("Failed to submit attendance", error);
      alert("সাবমিট ব্যর্থ হয়েছে।");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const newStudents: Student[] = jsonData.map((row: any) => {
        const id = row.studentId || row.ID || row.id || row['Student ID'] || '';
        const name = row.name || row.Name || row['Student Name'] || '';
        const room = row.roomNumber || row.Room || row.room || row['Room No'] || '';
        const cls = row.className || row.Class || row.class || row['Class Name'] || '';
        
        return { 
          studentId: String(id).trim(), 
          name: String(name).trim() || 'Unknown', 
          roomNumber: String(room).trim() || 'None',
          className: String(cls).trim() || 'General'
        };
      }).filter(s => s.studentId);

      if (newStudents.length > 0) {
        try {
          const batch = writeBatch(db);
          newStudents.forEach(s => {
            batch.set(doc(db, 'students', s.studentId), s);
          });
          await batch.commit();
          alert(`${newStudents.length} জন ছাত্রের ডাটা আপলোড সফল হয়েছে!`);
        } catch (error) {
          console.error("Upload failed", error);
          alert("আপলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const getStatus = (studentId: string) => {
    return attendance.find(a => a.studentId === studentId && a.mealType === selectedMeal)?.status;
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 font-sans text-slate-800 overflow-x-hidden lg:overflow-hidden relative selection:bg-indigo-100 selection:text-indigo-900">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-100/40 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-48 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white to-transparent opacity-80" />
      </div>

      {/* Header Section */}
      <header className="h-auto lg:h-20 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white flex flex-col lg:flex-row items-center justify-between px-4 lg:px-8 py-3 lg:py-0 shrink-0 shadow-xl z-50 border-b border-white/5">
        <div className="flex items-center justify-between w-full lg:w-auto mb-3 lg:mb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center font-black text-xl text-white border border-white/20 shadow-inner overflow-hidden">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="bg-gradient-to-br from-indigo-300 to-white bg-clip-text text-transparent">D</span>
              )}
            </div>
            <div>
              <h1 className="text-base lg:text-xl font-black tracking-tight leading-none mb-1">আল-জামি‘আহ আস-সালাফিয়্যাহ, দিনাজপুর বোডিং ম্যানেজমেন্ট</h1>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[9px] lg:text-[10px] text-indigo-200 uppercase font-bold tracking-widest leading-none">Dining Control Center</p>
              </div>
            </div>
          </div>
          
          <div className="flex lg:hidden items-center gap-2">
             <div className="text-right mr-1">
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">User</p>
                <p className="text-xs font-black leading-tight text-indigo-100">{currentUser.name}</p>
             </div>
             <button 
               onClick={handleLogout} 
               className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
             >
                <LogOut size={16} className="text-indigo-200" />
             </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-4 w-full lg:w-auto overflow-x-hidden">
          <nav className="flex gap-1.5 bg-indigo-950/40 p-1.5 rounded-xl w-full lg:w-auto overflow-x-auto whitespace-nowrap scrollbar-hide border border-white/5 no-scrollbar">
            {[
              { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
              { id: 'attendance', label: 'হাজিরা', icon: FileCheck2 },
              { id: 'students', label: 'ছাত্র প্রোফাইল', icon: UserCircle2 },
              { id: 'reports', label: 'Summary Report', icon: FileBarChart2 },
              { id: 'users', label: 'সেটিংস', icon: Settings },
            ].filter(b => {
              if (!currentUser) return false;
              if (b.id === 'users') return currentUser.role === 'Admin';
              if (currentUser.role === 'Viewer') {
                return ['dashboard', 'students', 'reports'].includes(b.id);
              }
              return true;
            }).map((btn) => (
              <button 
                key={btn.id}
                onClick={() => setView(btn.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs lg:text-sm font-bold transition-all relative ${view === btn.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50' : 'text-indigo-200 hover:bg-white/5'}`}
              >
                <btn.icon size={14} className={view === btn.id ? 'opacity-100' : 'opacity-50'} />
                {btn.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-4 bg-white/5 px-6 py-2 rounded-xl border border-white/10">
            <div className="text-right">
              <p className="text-[10px] font-bold text-indigo-300 uppercase leading-none mb-1">Session</p>
              <p className="text-sm font-black tracking-tight">{currentUser.name}</p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors group">
              <LogOut size={20} className="text-indigo-300 group-hover:text-white transition-colors" />
            </button>
          </div>

          <div className="w-full lg:w-auto bg-indigo-900/50 px-4 py-2 rounded-xl border border-white/10 flex justify-between lg:flex-col items-center lg:items-end">
            <span className="text-[9px] lg:text-[10px] text-indigo-300 uppercase leading-none lg:mb-1 font-bold">Today</span>
            <span className="font-bold text-xs lg:text-sm leading-none text-indigo-100">{new Date(selectedDate).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 overflow-x-hidden lg:overflow-hidden">
        
        {/* Sidebar: Navigation & Controls */}
        <aside className="w-full lg:w-72 flex flex-col gap-4 lg:gap-6 lg:overflow-y-auto no-scrollbar shrink-0 z-10">
          
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200 p-4 lg:p-6 shrink-0">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-[0.2em] flex items-center gap-2">
              <span className="w-1 h-1 bg-indigo-500 rounded-full" />
              Select Room (রুম নির্বাচন)
            </h3>
            <div className="flex lg:grid lg:grid-cols-2 gap-2 overflow-x-auto pb-2 lg:pb-0 no-scrollbar snap-x">
              {rooms.map(r => (
                <button 
                  key={r}
                  onClick={() => setRoomFilter(r)}
                  className={`flex-none w-20 lg:w-auto p-2.5 lg:p-3 rounded-xl font-black text-[11px] lg:text-xs text-center border transition-all snap-start ${roomFilter === r ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 translate-y-[-2px]' : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-500 hover:bg-slate-50'}`}
                >
                  {r === 'All' ? 'সব রুম' : r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:gap-6">
            {/* Date & Meal Picker */}
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200 p-4 lg:p-6 space-y-5">
              <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1 h-1 bg-indigo-500 rounded-full" />
                    Date (তারিখ)
                  </h3>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs lg:text-sm font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none"
                    />
                  </div>
              </div>
              
              <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1 h-1 bg-indigo-500 rounded-full" />
                    Meal (খাবার)
                  </h3>
                  <div className="grid grid-cols-3 lg:flex lg:flex-col gap-1.5 p-1 bg-slate-50 rounded-xl">
                    {(['Breakfast', 'Lunch', 'Dinner'] as MealType[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setSelectedMeal(m)}
                        className={`px-3 py-2 rounded-lg text-[10px] lg:text-sm text-center lg:text-left transition-all font-black ${selectedMeal === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {m === 'Breakfast' ? 'সকাল' : m === 'Lunch' ? 'দুপুর' : 'রাত'}
                      </button>
                    ))}
                  </div>
              </div>
            </div>

            {/* Data Upload Section */}
            {currentUser.role === 'Admin' && (
              <div className="bg-indigo-900 rounded-2xl border border-indigo-800 p-4 lg:p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all duration-700" />
                <h3 className="text-xs font-black text-white uppercase mb-3 tracking-wider flex items-center gap-2 relative z-10">
                  <Upload size={16} className="text-indigo-300" />
                  Data Upload
                </h3>
                <p className="text-[10px] text-indigo-200 mb-4 leading-relaxed font-medium relative z-10">Excel/CSV ফাইল থেকে ছাত্র আপলোড করুন।</p>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-indigo-700 rounded-xl cursor-pointer bg-indigo-950/50 hover:bg-indigo-950 hover:border-indigo-500 transition-all group relative z-10">
                  <div className="flex flex-col items-center justify-center pt-2 pb-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-800 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-4 h-4 text-indigo-300" />
                    </div>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Click to select</p>
                  </div>
                  <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            )}
          </div>
        </aside>

        {/* Action Area */}
        <section className="flex-1 flex flex-col bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/40 overflow-hidden min-h-[500px] z-10">
          
          <AnimatePresence mode="wait">
            {view === 'dashboard' && (
              <motion.div 
                key="dashboard-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col h-full bg-slate-50/30 overflow-y-auto"
              >
                <div className="p-4 lg:p-8 space-y-6 lg:space-y-8">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
                    <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                        <UsersRound size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-[8px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">মোট ছাত্র</p>
                        <h3 className="text-xl lg:text-3xl font-black text-slate-800">{dashboardStats.totalStudents}</h3>
                      </div>
                    </div>
                    <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[8px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">উপস্থিত (Present)</p>
                        <h3 className="text-xl lg:text-3xl font-black text-emerald-600">{dashboardStats.totalPresent}</h3>
                        <p className="text-[8px] lg:text-xs text-slate-400 mt-1 uppercase tracking-tighter">{selectedMeal}</p>
                      </div>
                    </div>
                    <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-rose-50 flex items-center justify-center mb-3">
                        <XCircle size={18} className="text-rose-600" />
                      </div>
                      <div>
                        <p className="text-[8px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">অনুপস্থিত (Absent)</p>
                        <h3 className="text-xl lg:text-3xl font-black text-rose-600">{dashboardStats.totalAbsent}</h3>
                        <p className="text-[8px] lg:text-xs text-slate-400 mt-1 uppercase tracking-tighter">{selectedMeal}</p>
                      </div>
                    </div>
                    <div className="bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                        <LineChart size={18} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="text-[8px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">পার্সেন্টেজ</p>
                        <h3 className="text-xl lg:text-3xl font-black text-indigo-600">{dashboardStats.attendancePercentage.toFixed(1)}%</h3>
                        <div className="w-full h-1 lg:h-1.5 bg-slate-100 rounded-full mt-2 lg:mt-3 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${dashboardStats.attendancePercentage}%` }}
                            className="h-full bg-indigo-600 rounded-full" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Room breakdown */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 lg:px-8 py-4 lg:py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                      <h3 className="font-bold text-sm lg:text-base text-slate-800 flex items-center gap-2">
                        <LayoutDashboard size={18} className="text-indigo-600" />
                        রুম ভিত্তিক রিপোর্ট ({selectedMeal})
                      </h3>
                      <div className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                         {new Date(selectedDate).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })}
                      </div>
                    </div>
                    <div className="p-4 lg:p-8">
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                          {dashboardStats.roomStats.map(([room, stats]) => (
                             <div key={room} className="relative overflow-hidden p-5 rounded-2xl border border-slate-100 bg-white hover:shadow-xl hover:-translate-y-1 transition-all group">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
                                
                                <div className="relative flex justify-between items-start mb-4">
                                   <div>
                                      <h4 className="font-black text-indigo-900 text-lg">রুম {room}</h4>
                                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Digital Entry Record</span>
                                   </div>
                                   <div className="bg-slate-900 text-white px-2 py-1 rounded text-[9px] font-black">
                                      {stats.total} জন
                                   </div>
                                </div>
                                
                                <div className="relative space-y-3">
                                   <div className="flex justify-between items-center text-xs lg:text-sm">
                                      <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                         <span className="text-slate-500 font-medium">উপস্থিত</span>
                                      </div>
                                      <span className="font-black text-emerald-600">{stats.present}</span>
                                   </div>
                                   <div className="flex justify-between items-center text-xs lg:text-sm">
                                      <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-rose-500" />
                                         <span className="text-slate-500 font-medium">অনুপস্থিত</span>
                                      </div>
                                      <span className="font-black text-rose-500">{stats.absent}</span>
                                   </div>
                                   
                                   <div className="pt-2">
                                      <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1.5 uppercase">
                                         <span>Attendance Rate</span>
                                         <span>{((stats.present / stats.total) * 100 || 0).toFixed(0)}%</span>
                                      </div>
                                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                         <motion.div 
                                           initial={{ width: 0 }}
                                           animate={{ width: `${(stats.present / stats.total) * 100}%` }}
                                           className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                                         />
                                         <motion.div 
                                           initial={{ width: 0 }}
                                           animate={{ width: `${(stats.absent / stats.total) * 100}%` }}
                                           className="h-full bg-rose-500 transition-all duration-1000 shadow-[0_0_8px_rgba(244,63,94,0.4)]" 
                                         />
                                      </div>
                                   </div>

                                   <div className="pt-2 flex gap-1 justify-end">
                                      <div className="text-[9px] font-bold text-slate-300 italic">
                                         {stats.total - (stats.present + stats.absent)} entries pending
                                      </div>
                                   </div>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'attendance' && (
              <motion.div 
                key="attendance-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col h-full"
              >
                {/* View Header */}
                <div className="px-4 lg:px-6 py-4 lg:py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="w-1.5 h-6 lg:h-8 bg-indigo-600 rounded-full" />
                    <div>
                      <h2 className="text-sm lg:text-lg font-bold text-slate-800 leading-tight">রুম: {roomFilter} - হাজিরা তালিকা</h2>
                      <p className="text-[10px] lg:text-sm text-slate-500 font-medium">মোট ছাত্র: {currentStudents.length} জন</p>
                    </div>
                  </div>
                  
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 text-slate-600" size={14} />
                        <input 
                          type="text" 
                          placeholder="খুঁজুন..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-full pl-9 pr-4 py-2 lg:py-1.5 text-xs lg:text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                        />
                      </div>

                      {canRecordAttendance && (
                        <>
                          <button 
                            onClick={() => setIsEditMode(true)}
                            className="bg-white border border-slate-200 text-slate-600 px-3 lg:px-4 py-2.5 lg:py-2 rounded-lg font-bold text-xs lg:text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                            title="রিফ্রেশ করুন"
                          >
                            <LineChart size={16} className="text-indigo-400" />
                            রিফ্রেশ
                          </button>

                          {isEditMode ? (
                            <button 
                              onClick={handleSubmitAttendance}
                              className="bg-emerald-600 text-white px-4 lg:px-6 py-2.5 lg:py-2 rounded-lg font-bold text-xs lg:text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 size={16} />
                              সাবমিট করুন
                            </button>
                          ) : (
                            <button 
                              onClick={() => setIsEditMode(true)}
                              className="bg-indigo-600 text-white px-4 lg:px-6 py-2.5 lg:py-2 rounded-lg font-bold text-xs lg:text-sm shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                              <FileText size={16} />
                              আপডেট হাজিরা
                            </button>
                          )}
                        </>
                      )}
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-auto">
                  <div className="min-w-[600px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase text-[9px] lg:text-[10px] font-bold tracking-widest border-b border-slate-200 z-10">
                        <tr>
                          <th className="px-4 lg:px-8 py-3 lg:py-4 w-24 lg:w-32">Student ID</th>
                          <th className="px-4 lg:px-8 py-3 lg:py-4 text-center w-48 lg:w-64">Hajira (হাজিরা)</th>
                          <th className="px-4 lg:px-8 py-3 lg:py-4">Student Name (Class)</th>
                          <th className="px-4 lg:px-8 py-3 lg:py-4 w-24 lg:w-32">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentStudents.map(student => {
                          const status = draftAttendance[student.studentId];
                          const recordedBy = attendance.find(a => a.studentId === student.studentId && a.mealType === selectedMeal)?.recordedBy;
                          return (
                            <motion.tr 
                              layout
                              key={student.studentId}
                              className={`transition-colors group ${!isEditMode ? 'opacity-80' : 'hover:bg-indigo-50/30'}`}
                            >
                              <td className="px-4 lg:px-8 py-3 lg:py-4 font-mono text-xs lg:text-sm text-indigo-600 font-bold">{student.studentId}</td>
                              <td className="px-4 lg:px-8 py-3 lg:py-4">
                                <div className={`flex justify-center gap-2 lg:gap-3 ${!isEditMode ? 'pointer-events-none opacity-50' : ''}`}>
                                  <button 
                                    onClick={() => handleStatusChange(student.studentId, 'Present')}
                                    className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-[10px] lg:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${draftAttendance[student.studentId]?.status === 'Present' ? 'bg-emerald-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-500'}`}
                                  >
                                    <CheckCircle2 size={12} className="lg:hidden" />
                                    <CheckCircle2 size={14} className="hidden lg:block" />
                                    P
                                  </button>
                                  <button 
                                    onClick={() => handleStatusChange(student.studentId, 'Absent')}
                                    className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-[10px] lg:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${draftAttendance[student.studentId]?.status === 'Absent' ? 'bg-rose-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500'}`}
                                  >
                                    <XCircle size={12} className="lg:hidden" />
                                    <XCircle size={14} className="hidden lg:block" />
                                    A
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 lg:px-8 py-3 lg:py-4">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2">
                                  <span className="font-bold text-xs lg:text-sm text-slate-800">{student.name}</span>
                                  <span className="w-fit px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] lg:text-[9px] font-bold uppercase shrink-0">C{student.className}</span>
                                </div>
                                <div className="text-[9px] lg:text-[10px] text-slate-400 font-medium font-mono">ROOM {student.roomNumber}</div>
                              </td>
                              <td className="px-4 lg:px-8 py-3 lg:py-4 text-center">
                                {draftAttendance[student.studentId] ? (
                                  <div className="flex flex-col items-start gap-1">
                                    <span className={`px-2 py-0.5 lg:py-1 rounded text-[8px] lg:text-[10px] font-black uppercase tracking-widest ${draftAttendance[student.studentId].status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {draftAttendance[student.studentId].status === 'Present' ? 'উপস্থিত' : 'অনুপস্থিত'}
                                    </span>
                                    {(draftAttendance[student.studentId].timestamp || recordedBy) && (
                                      <div className="text-[8px] lg:text-[9px] text-slate-400 font-mono leading-tight text-left">
                                        {draftAttendance[student.studentId].timestamp && <div>{draftAttendance[student.studentId].timestamp}</div>}
                                        {recordedBy && <div className="text-indigo-400">By: {recordedBy}</div>}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded text-[8px] lg:text-[10px] font-bold uppercase tracking-widest">বাকি</span>
                                )}
                              </td>
                            </motion.tr>
                          );
                        })}
                        {currentStudents.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-10 lg:p-20 text-center">
                               <UsersRound size={32} className="mx-auto opacity-10 mb-4" />
                               <h3 className="text-sm lg:text-xl font-bold opacity-30 italic">No students found</h3>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Summary Stats */}
                <div className="bg-slate-50 border-t border-slate-200 p-4 lg:p-5 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                  <div className="flex flex-wrap justify-center gap-4 lg:gap-8">
                    <span className="flex items-center gap-2 text-[10px] lg:text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-emerald-500 ring-2 lg:ring-4 ring-emerald-500/10"></div> 
                      উপস্থিত: <span className="text-emerald-600 font-black">{presentCount}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[10px] lg:text-xs font-bold text-slate-600">
                      <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-rose-500 ring-2 lg:ring-4 ring-rose-500/10"></div> 
                      অনুপস্থিত: <span className="text-rose-600 font-black">{absentCount}</span>
                    </span>
                  </div>
                  <p className="text-[8px] lg:text-[10px] uppercase tracking-widest font-black text-slate-400">© ২০২৬ ডাইনিং ম্যানেজমেন্ট সিস্টেম</p>
                </div>
              </motion.div>
            )}

            {view === 'students' && (
              <motion.div 
                key="students-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col h-full"
              >
                 <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 shrink-0">
                    <div>
                      <h2 className="text-xl font-bold">ছাত্র প্রোফাইল ডাটাবেস</h2>
                      <p className="text-sm text-slate-500">মোট ছাত্র: {students.length} জন</p>
                    </div>
                    
                    {currentUser.role !== 'Viewer' && (
                      <form onSubmit={handleAddStudent} className="flex flex-wrap items-end gap-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">ID</label>
                          <input 
                            required
                            type="text" 
                            value={studentForm.studentId}
                            onChange={e => setStudentForm(prev => ({ ...prev, studentId: e.target.value }))}
                            className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs w-24 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="ID"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Name</label>
                          <input 
                            required
                            type="text" 
                            value={studentForm.name}
                            onChange={e => setStudentForm(prev => ({ ...prev, name: e.target.value }))}
                            className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs w-32 lg:w-48 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Name"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Class</label>
                          <input 
                            required
                            type="text" 
                            value={studentForm.className}
                            onChange={e => setStudentForm(prev => ({ ...prev, className: e.target.value }))}
                            className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs w-20 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Class"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Room No</label>
                          <input 
                            required
                            type="text" 
                            value={studentForm.roomNumber}
                            onChange={e => setStudentForm(prev => ({ ...prev, roomNumber: e.target.value }))}
                            className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs w-20 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Room"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                        >
                          সংযুক্ত করুন
                        </button>
                      </form>
                    )}
                 </div>
                 
                 <div className="flex-1 overflow-auto no-scrollbar">
                    <div className="min-w-[500px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-900 text-white uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-800 z-10">
                        <tr>
                          <th className="px-8 py-4">Student ID</th>
                          <th className="px-8 py-4">Name (নাম)</th>
                          <th className="px-8 py-4">Class</th>
                          <th className="px-8 py-4">Room No.</th>
                          {currentUser.role !== 'Viewer' && <th className="px-8 py-4 text-right">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedStudents.map(s => (
                          <tr key={s.studentId} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-4 font-mono font-bold text-indigo-600">{s.studentId}</td>
                            <td className="px-8 py-4 font-bold">{s.name}</td>
                            <td className="px-8 py-4">
                              <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-bold">Class {s.className}</span>
                            </td>
                            <td className="px-8 py-4">
                              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black tracking-tighter">ROOM {s.roomNumber}</span>
                            </td>
                            {currentUser.role !== 'Viewer' && (
                              <td className="px-8 py-4 text-right">
                                <button 
                                  onClick={() => handleDeleteStudent(s.studentId)}
                                  className="text-rose-400 hover:text-rose-600 transition-colors"
                                  title="ডিলিট"
                                >
                                  <XCircle size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'reports' && (
              <motion.div 
                key="reports-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col h-full space-y-4 lg:space-y-6"
              >
                 <div className="bg-white p-4 lg:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-end shrink-0">
                    <div className="space-y-1">
                       <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">রিপোর্ট তারিখ</h3>
                       <input 
                         type="date" 
                         value={selectedDate}
                         onChange={(e) => setSelectedDate(e.target.value)}
                         className="w-full lg:w-48 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                       />
                    </div>

                    <div className="space-y-1">
                       <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">রুম সিলেক্ট (Select Room)</h3>
                       <select 
                         value={roomFilter}
                         onChange={(e) => setRoomFilter(e.target.value)}
                         className="w-full lg:w-48 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                       >
                         {rooms.map(room => (
                           <option key={room} value={room}>{room === 'All' ? 'সব রুম' : `রুম ${room}`}</option>
                         ))}
                       </select>
                    </div>

                    <div className="flex-1">
                      <h2 className="text-lg lg:text-xl font-bold">সারসংক্ষেপ রিপোর্ট</h2>
                      <p className="text-xs lg:text-sm text-slate-500">তারিখ ও রুম অনুযায়ী হাজিরা স্ট্যাটাস</p>
                    </div>
                    <button 
                      onClick={() => {
                        const reportStudents = students.filter(s => roomFilter === 'All' || s.roomNumber === roomFilter);
                        const report = reportStudents.map(s => {
                          const meals = ['Breakfast', 'Lunch', 'Dinner'] as MealType[];
                          const mealData: any = {};
                          meals.forEach(mt => {
                            const record = attendance.find(a => a.studentId === s.studentId && a.mealType === mt);
                            mealData[`${mt} Status`] = record ? (record.status === 'Present' ? 'উপস্থিত' : 'অনুপস্থিত') : '-';
                            mealData[`${mt} Time`] = record?.timestamp || '-';
                            mealData[`${mt} By`] = record?.recordedBy || '-';
                          });

                          return {
                            'Student ID': s.studentId,
                            'Name': s.name,
                            'Class': s.className,
                            'Room': s.roomNumber,
                            ...mealData,
                            'Date': selectedDate
                          };
                        });
                        const ws = XLSX.utils.json_to_sheet(report);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Attendance Report");
                        XLSX.writeFile(wb, `Report_${selectedDate}_Room_${roomFilter}.xlsx`);
                      }}
                      className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                    >
                      <FileText size={18} />
                      Excel ডাউনলোড
                    </button>
                 </div>

                 <div className="flex-1 bg-white/50 backdrop-blur-sm rounded-2xl shadow-xl border border-white/40 overflow-auto no-scrollbar">
                    <div className="min-w-[700px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900 text-white uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-800 sticky top-0 z-20">
                          <tr>
                            <th className="px-6 lg:px-8 py-3 lg:py-4">ID</th>
                            <th className="px-6 lg:px-8 py-3 lg:py-4">নাম (Class)</th>
                            <th className="px-6 lg:px-8 py-3 lg:py-4">রুম</th>
                            <th className="px-6 lg:px-8 py-3 lg:py-4 text-center">সকাল</th>
                            <th className="px-6 lg:px-8 py-3 lg:py-4 text-center">দুপুর</th>
                            <th className="px-6 lg:px-8 py-3 lg:py-4 text-center">রাত</th>
                          </tr>
                        </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedStudents.filter(s => roomFilter === 'All' || s.roomNumber === roomFilter).map(s => {
                          const getRecord = (mt: MealType) => attendance.find(a => a.studentId === s.studentId && a.mealType === mt);
                          return (
                            <tr key={s.studentId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-8 py-4 font-mono font-bold text-indigo-600 text-sm">{s.studentId}</td>
                              <td className="px-8 py-4">
                                <div className="font-bold text-slate-800">{s.name}</div>
                                <div className="text-[10px] text-slate-400 font-bold">Class {s.className}</div>
                              </td>
                              <td className="px-8 py-4 text-slate-500">{s.roomNumber}</td>
                              {[ 'Breakfast', 'Lunch', 'Dinner' ].map((mt) => {
                                const rec = getRecord(mt as MealType);
                                return (
                                  <td key={mt} className="px-4 lg:px-8 py-4 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      {rec ? (
                                        <>
                                          <span className={`px-2 py-0.5 rounded text-[8px] lg:text-[9px] font-black uppercase tracking-widest ${rec.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {rec.status === 'Present' ? 'উপস্থিত' : 'অনুপস্থিত'}
                                          </span>
                                          <div className="text-[8px] lg:text-[9px] text-slate-400 font-mono leading-tight">
                                            {rec.timestamp}
                                          </div>
                                          {rec.recordedBy && (
                                            <div className="text-[8px] lg:text-[9px] text-indigo-400 font-medium">
                                              By: {rec.recordedBy}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-300 text-xs">-</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'users' && (
              <motion.div 
                key="users-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col h-full space-y-4 lg:space-y-6 lg:p-6"
              >
                <div className="bg-indigo-50 p-4 lg:p-6 rounded-xl border border-indigo-100 shrink-0">
                  <h3 className="text-lg lg:text-xl font-bold text-indigo-900 mb-4">নতুন ইউজার তৈরি করুন</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">পুরো নাম</label>
                      <input 
                        type="text" 
                        value={authForm.name}
                        onChange={e => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">ইউজারনেম</label>
                      <input 
                        type="text" 
                        value={authForm.username}
                        onChange={e => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Username"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">পাসওয়ার্ড</label>
                      <input 
                        type="password" 
                        value={authForm.password}
                        onChange={e => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="Password"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">রোল (Role)</label>
                      <select 
                        value={authForm.role}
                        onChange={e => setAuthForm(prev => ({ ...prev, role: e.target.value as 'Admin' | 'Staff' | 'Viewer' }))}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none"
                      >
                        <option value="Staff">Staff</option>
                        <option value="Admin">Admin</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => handleRegister()}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-md hover:bg-indigo-700 transition-all"
                    >
                      ইউজার যোগ করুন
                    </button>
                  </div>
                </div>

                <div className="bg-white p-4 lg:p-6 rounded-xl border border-slate-200 shrink-0">
                  <h3 className="text-lg lg:text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Upload size={20} className="text-indigo-600" />
                    লোগো পরিবর্তন করুন
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-4 items-end max-w-2xl">
                    <div className="flex-1 space-y-1 w-full">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logo Image URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={settings.logoUrl}
                          onChange={e => setSettings(prev => ({ ...prev, logoUrl: e.target.value }))}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                          placeholder="https://example.com/logo.png"
                        />
                        <label className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg font-bold text-sm border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-all flex items-center gap-2 shrink-0">
                          <Upload size={16} />
                          <span>ফাইল</span>
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 800000) { // Limit to ~800KB to allow for base64 overhead
                                  alert("ইমেজ ফাইলটি অনেক বড় (৮০০ কেবি এর বেশি)। দয়া করে ছোট সাইজের ইমেজ ব্যবহার করুন অথবা ইমেজের লিঙ্ক দিন।");
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSettings(prev => ({ ...prev, logoUrl: reader.result as string }));
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'settings', 'config'), settings);
                          alert("লোগো আপডেট সফল হয়েছে!");
                        } catch (err: any) {
                          console.error(err);
                          alert("আপডেট ব্যর্থ হয়েছে: " + err.message);
                        }
                      }}
                      className="bg-slate-900 text-white px-8 py-2 rounded-lg font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                    >
                      সংরক্ষণ করুন
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 font-medium italic">প্রোফাইল পিকচার বা লোগো হিসেবে ব্যবহার করার জন্য একটি ইমেজ লিঙ্ক দিন।</p>
                </div>

                <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/40 overflow-auto no-scrollbar">
                  <div className="min-w-[600px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900 text-white uppercase text-[9px] font-black tracking-[0.2em] border-b border-slate-800 sticky top-0 z-20">
                      <tr>
                        <th className="px-8 py-4">নাম</th>
                        <th className="px-8 py-4">ইউজারনেম</th>
                        <th className="px-8 py-4">রোল (Role)</th>
                        <th className="px-8 py-4 text-right">অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map(u => (
                        <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-4 font-bold">{u.name}</td>
                          <td className="px-8 py-4 font-mono text-sm text-indigo-600">{u.username}</td>
                          <td className="px-8 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${
                              u.role === 'Admin' ? 'bg-amber-100 text-amber-700' : 
                              u.role === 'Viewer' ? 'bg-blue-100 text-blue-600' : 
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            {(u as any).uid !== (currentUser as any).uid && (
                              <button 
                                onClick={() => handleDeleteUser((u as any).uid)}
                                className="text-rose-500 hover:text-rose-700 font-bold p-2 transition-colors"
                                title="ডিলিট করুন"
                              >
                                <XCircle size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
