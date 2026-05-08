import { create } from 'zustand';

export const useUIStore = create((set) => ({
  theme: 'dark',
  sidebarOpen: false,
  toasts: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addToast: (toast) => set((s) => ({
    toasts: [...s.toasts, { id: Date.now(), ...toast }],
  })),
  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),
}));
