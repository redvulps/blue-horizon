import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ShowToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastState {
  toasts: ToastMessage[];
  showToast: (input: ShowToastInput) => number;
  dismissToast: (id: number) => void;
  clearToasts: () => void;
}

let toastIdCounter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: ({ title, description, variant = "info", durationMs = 2600 }) => {
    const id = Date.now() + toastIdCounter++;

    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          title,
          description,
          variant,
        },
      ],
    }));

    if (durationMs > 0) {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, durationMs);
    }

    return id;
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),
}));

export const selectToasts = (state: ToastState) => state.toasts;
