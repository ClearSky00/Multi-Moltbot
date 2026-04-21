import { create } from 'zustand';

let _nextId = 1;

const MAX_TOASTS = 5;
const DEFAULT_DURATION_MS = 5000;

const useToastStore = create((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = String(_nextId++);
    const newToast = {
      id,
      type: toast.type || 'info',
      title: toast.title || '',
      message: toast.message || '',
      duration: toast.duration ?? DEFAULT_DURATION_MS,
      action: toast.action || null,
      persistent: toast.persistent ?? false,
    };

    set((state) => {
      const toasts = [newToast, ...state.toasts].slice(0, MAX_TOASTS);
      return { toasts };
    });

    if (!newToast.persistent && newToast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, newToast.duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => set({ toasts: [] }),
}));

export default useToastStore;
