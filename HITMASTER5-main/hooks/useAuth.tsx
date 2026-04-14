import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserRole } from '@/types/core';

interface AuthState {
  user: {
    id: string;
    role: UserRole;
  } | null;
  isLoading: boolean;
  setRole: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  purchaseSubscription: (plan: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
  const [user, setUser] = useState<AuthState['user']>({ id: 'default', role: 'free' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem('user');
      if (stored) {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
      } else {
        // Default to free user
        const defaultUser = { id: 'default', role: 'free' as UserRole };
        setUser(defaultUser);
        AsyncStorage.setItem('user', JSON.stringify(defaultUser)).catch(console.error);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      // Ensure we have a default user even on error
      const defaultUser = { id: 'default', role: 'free' as UserRole };
      setUser(defaultUser);
    } finally {
      setIsLoading(false);
    }
  };

  const setRole = useCallback(async (role: UserRole) => {
    const updatedUser = { ...user, id: user?.id || 'default', role };
    setUser(updatedUser);
    await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
  }, [user]);

  const signOut = useCallback(async () => {
    const defaultUser = { id: 'default', role: 'free' as UserRole };
    setUser(defaultUser);
    await AsyncStorage.setItem('user', JSON.stringify(defaultUser));
  }, []);

  const purchaseSubscription = useCallback(async (plan: string): Promise<boolean> => {
    console.log('[useAuth] Purchasing subscription:', plan);
    try {
      // Phase 3: Live subscription purchase (placeholder)
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
      await setRole('premium');
      return true;
    } catch (error) {
      console.log('[useAuth] Purchase failed:', error);
      return false;
    }
  }, [setRole]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    console.log('[useAuth] Restoring purchases');
    try {
      // Phase 3: Live restore purchases (placeholder)
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
      await setRole('premium');
      return true;
    } catch (error) {
      console.log('[useAuth] Restore failed:', error);
      return false;
    }
  }, [setRole]);

  return useMemo(() => ({ 
    user, 
    isLoading, 
    setRole, 
    signOut, 
    purchaseSubscription, 
    restorePurchases 
  }), [user, isLoading, setRole, signOut, purchaseSubscription, restorePurchases]);
});