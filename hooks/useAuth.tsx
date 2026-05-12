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
        const defaultUser = { id: 'default', role: 'free' as UserRole };
        setUser(defaultUser);
        AsyncStorage.setItem('user', JSON.stringify(defaultUser)).catch(console.error);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
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
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const appKeys = allKeys.filter(k =>
        k !== 'user' &&
        !k.startsWith('@react-navigation') &&
        !k.startsWith('expo-')
      );
      if (appKeys.length > 0) await AsyncStorage.multiRemove(appKeys);
      await AsyncStorage.setItem('user', JSON.stringify(defaultUser));
    } catch {
      await AsyncStorage.setItem('user', JSON.stringify(defaultUser));
    }
  }, []);

  const purchaseSubscription = useCallback(async (_plan: string): Promise<boolean> => {
    // TODO Phase 3: integrate StoreKit/Google Play receipt validation before commercial launch
    return false;
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    // TODO Phase 3: integrate StoreKit/Google Play receipt validation before commercial launch
    return false;
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