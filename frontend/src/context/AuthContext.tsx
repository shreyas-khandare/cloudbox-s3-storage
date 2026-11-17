
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../services/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PRO" | "BUSINESS";
  storageUsed: string;
  storageLimit: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
  googleLogin: (token: string) => Promise<User>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await api.get("/auth/me");
      const nextUser = res.data.user as User;
      setUser(nextUser);
      return nextUser;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await refreshUser();
      if (!currentUser) {
        setUser(null);
      }
      setLoading(false);
    };

    void checkAuth();
  }, [refreshUser]);

  const logout = async (): Promise<void> => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  };

  const googleLogin = async (token: string): Promise<User> => {
    const res = await api.post("/auth/google", { token });
    setUser(res.data.user);
    return res.data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refreshUser, logout, googleLogin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be inside AuthProvider");
  }

  return context;
};
