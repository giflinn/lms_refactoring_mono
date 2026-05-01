import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { fetchMe, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Re-fetches the DB row for the currently authenticated user. Use after a
  // mutation that changes the user's own profile (e.g. self-edit) so the
  // header avatar / name reflect the change without a full reload.
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export class AccessDeniedError extends Error {
  constructor() {
    super("access_denied");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const token = await fbUser.getIdToken();
        const me = await fetchMe(token);
        if (me && (me.role === "senior_manager" || me.role === "admin")) {
          setUser(me);
        } else {
          await firebaseSignOut(auth);
          setUser(null);
        }
      } catch {
        await firebaseSignOut(auth);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    const me = await fetchMe(token);
    if (!me || (me.role !== "senior_manager" && me.role !== "admin")) {
      await firebaseSignOut(auth);
      throw new AccessDeniedError();
    }
    setUser(me);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  const refreshUser = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const token = await fbUser.getIdToken();
    const me = await fetchMe(token);
    if (me && me.role !== "client") setUser(me);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
