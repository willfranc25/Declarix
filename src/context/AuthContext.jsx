import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { clearActiveOrganization } from '../services/organizationService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      // Sin credenciales Supabase: modo local sin autenticación remota
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const noClientError = { data: null, error: new Error('Supabase no está configurado (.env)') };

  const login = async (email, password) => {
    if (!supabase) return noClientError;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signup = async (email, password) => {
    if (!supabase) return noClientError;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const loginWithMagicLink = async (email) => {
    if (!supabase) return noClientError;
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { data, error };
  };

  const logout = async () => {
    clearActiveOrganization();
    if (!supabase) return { error: null };
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email) => {
    if (!supabase) return noClientError;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { data, error };
  };

  const updatePassword = async (newPassword) => {
    if (!supabase) return noClientError;
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
  };

  const value = {
    user,
    session,
    loading,
    login,
    signup,
    loginWithMagicLink,
    logout,
    resetPassword,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}