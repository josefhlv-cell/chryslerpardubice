import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  account_type: string;
  status: string;
  company_name: string | null;
  ico: string | null;
  dic: string | null;
  discount_percent: number;
  loyalty_active: boolean;
  service_history_enabled: boolean;
}

interface Employee {
  id: string;
  user_id: string | null;
  name: string;
  role: string;
  email: string | null;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  employee: Employee | null;
  isAdmin: boolean;
  isLoading: boolean;
  isPendingBusiness: boolean;
  canPlaceOrder: boolean;
  signUp: (email: string, password: string, meta: SignUpMeta) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

interface SignUpMeta {
  full_name: string;
  account_type: "private" | "business";
  company_name?: string;
  ico?: string;
  dic?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    setProfile(data);
  };

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const fetchEmployee = async (userId: string) => {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    setEmployee(data as Employee | null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            checkAdmin(session.user.id);
            fetchEmployee(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setEmployee(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        checkAdmin(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isPendingBusiness = profile?.account_type === "business" && profile?.status === "pending";
  const canPlaceOrder = !!profile && profile.status === "active";

  const signUp = async (email: string, password: string, meta: SignUpMeta) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: meta.full_name,
          account_type: meta.account_type,
          company_name: meta.company_name || null,
          ico: meta.ico || null,
          dic: meta.dic || null,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, isAdmin, isLoading,
      isPendingBusiness, canPlaceOrder,
      signUp, signIn, signOut, refreshProfile, resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
