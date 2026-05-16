import { Student, AttendanceRecord, User, AppSettings } from '../types';
import { db, auth } from './firebase';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  where, 
  deleteDoc,
  getDoc,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(errInfo.error);
}

export const api = {
  getSettings: async (): Promise<AppSettings> => {
    const path = 'settings/config';
    try {
      const d = await getDoc(doc(db, path));
      if (d.exists()) return d.data() as AppSettings;
      return { logoUrl: '' };
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, path);
      return { logoUrl: '' };
    }
  },
  
  updateSettings: async (settings: AppSettings): Promise<void> => {
    const path = 'settings/config';
    try {
      await setDoc(doc(db, path), settings);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },
  
  getStudents: async (): Promise<Student[]> => {
    const path = 'students';
    try {
      const snap = await getDocs(collection(db, path));
      return snap.docs.map(d => d.data() as Student);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  },
  
  updateStudents: async (students: Student[]): Promise<void> => {
    const path = 'students';
    try {
      const batch = writeBatch(db);
      students.forEach(s => {
        batch.set(doc(db, path, s.studentId), s);
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },
  
  deleteStudent: async (id: string): Promise<void> => {
    const path = `students/${id}`;
    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  },
  
  getAttendance: async (date?: string): Promise<AttendanceRecord[]> => {
    const path = 'attendance';
    try {
      let q = collection(db, path) as any;
      if (date) {
        q = query(collection(db, path), where('date', '==', date));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as AttendanceRecord);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  },
  
  submitAttendance: async (records: AttendanceRecord[]): Promise<void> => {
    const path = 'attendance';
    try {
      const batch = writeBatch(db);
      records.forEach(r => {
        const id = `${r.date}_${r.mealType}_${r.studentId}`;
        batch.set(doc(db, path, id), {
          ...r,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  },
  
  getUsers: async (): Promise<User[]> => {
    const path = 'users';
    try {
      const snap = await getDocs(collection(db, path));
      return snap.docs.map(d => d.data() as User);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, path);
      return [];
    }
  },
  
  register: async (user: any): Promise<void> => {
    const email = `${user.username.toLowerCase()}@hostel.internal`;
    try {
      // If registering a new user, we might be the current admin or it's the first initialization
      const userCredential = await createUserWithEmailAndPassword(auth, email, user.password);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: user.username,
        name: user.name,
        role: user.role || 'Staff'
      });
      // After registration, if the admin was doing it, they remain logged in
      // If this was first init, they are now logged in as the new user
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        throw new Error("Username already exists");
      }
      throw e;
    }
  },
  
  login: async (credentials: any): Promise<User> => {
    const email = `${credentials.username.toLowerCase()}@hostel.internal`;
    try {
      const res = await signInWithEmailAndPassword(auth, email, credentials.password);
      const userDoc = await getDoc(doc(db, 'users', res.user.uid));
      if (userDoc.exists()) {
        return userDoc.data() as User;
      }
      throw new Error("User record not found");
    } catch (e) {
      throw new Error("Invalid username or password");
    }
  },
  
  logout: async (): Promise<void> => {
    await signOut(auth);
  },

  loginWithGoogle: async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    try {
      const res = await signInWithPopup(auth, provider);
      const userDoc = await getDoc(doc(db, 'users', res.user.uid));
      if (userDoc.exists()) {
        return userDoc.data() as User;
      }
      // If it's the admin email, return a temporary super admin profile
      if (res.user.email === 'jamiahdinajpur.edu@gmail.com') {
        return { username: 'admin', name: 'Super Admin', role: 'Admin' };
      }
      throw new Error("User record not found. Please ask an admin to add you.");
    } catch (e) {
      console.error(e);
      throw new Error("Google login failed");
    }
  },
  
  deleteUser: async (username: string): Promise<void> => {
    // Note: In a real app, you'd need the UID or a cloud function to delete from Auth
    // Here we just delete the Firestore record as an example or use a search
    const path = 'users';
    try {
      const q = query(collection(db, path), where('username', '==', username));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  }
};
