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
  syncingTime: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const getCachedProfile = (): Profile | null => {
  try {
    const cached = localStorage.getItem('itemku-pricer-profile');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const hasLocalSession = (): boolean => {
  try {
    return Object.keys(localStorage).some(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
  } catch {
    return false;
  }
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  syncingTime: false,
  error: null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(getCachedProfile);
  const [loading, setLoading] = useState(() => !getCachedProfile() || !hasLocalSession());
  const [syncingTime, setSyncingTime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, retries = 10) => {
    setError(null);
    setSyncingTime(false);
    
    for (let i = 0; i < retries; i++) {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.warn(`[Profiles Auth Sync] Attempt ${i + 1}/${retries} failed:`, profileError);
        
        if (profileError.message?.includes('JWT issued at future') && i < retries - 1) {
          setSyncingTime(true);
          const backoffDelay = (i + 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
        
        // Jika gagal total dan tidak ada cache, baru tampilkan error
        if (!profile) {
          setError(`Gagal memuat profil pengguna: ${profileError.message}`);
        }
      } else if (!data) {
        if (!profile) {
          setError('Profil tidak ditemukan. Silakan hubungi admin.');
        }
      } else {
        setError(null);
        setProfile(data);
        localStorage.setItem('itemku-pricer-profile', JSON.stringify(data));
      }
      break;
    }
    setSyncingTime(false);
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
      
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && newUser)) {
        setSession(session);
        setUser(newUser);
        // Jika sudah ada cache profil, tidak perlu set loading ke true agar UI instan
        if (!localStorage.getItem('itemku-pricer-profile')) {
          setLoading(true);
        }
        fetchProfile(newUser!.id);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('itemku-pricer-profile');
        localStorage.removeItem('itemku-pricer-config');
        localStorage.removeItem('itemku-pricer-products');
        localStorage.removeItem('itemku-pricer-logs');
        setSession(null);
        setUser(null);
        setProfile(null);
        setError(null);
        setLoading(false);
      } else {
        setSession(session);
        setUser(newUser);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = { session, user, profile, loading, syncingTime, error, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};