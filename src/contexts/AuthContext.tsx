import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  is_enabled: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  error: null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      setError(`Gagal memuat profil pengguna: ${profileError.message}`);
      setProfile(null);
    } else if (!data) {
      setError('Profil tidak ditemukan. Silakan hubungi admin.');
      setProfile(null);
    } else {
      setError(null);
      setProfile(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;
      
      // Hanya set loading jika user benar-benar berubah (login baru)
      // Jika hanya token refresh, jangan ganggu UI
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && newUser)) {
        setSession(session);
        setUser(newUser);
        setLoading(true);
        fetchProfile(newUser!.id);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setError(null);
        setLoading(false);
      } else {
        // Untuk event lain seperti TOKEN_REFRESHED, cukup update session tanpa loading
        setSession(session);
        setUser(newUser);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = { session, user, profile, loading, error, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};