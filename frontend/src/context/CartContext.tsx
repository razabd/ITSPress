'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CartItem } from '@/types';

interface CartContextValue {
  items: CartItem[];
  count: number;
  refresh: () => Promise<void>;
  clear: () => void;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  refresh: async () => {},
  clear: () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'pelanggan') {
      setItems([]);
      return;
    }
    try {
      const data = await apiClient.get('/cart');
      setItems(data.data || []);
    } catch {
      // abaikan error — cart tidak kritis
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const clear = () => setItems([]);

  return (
    <CartContext.Provider value={{ items, count: items.length, refresh, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
