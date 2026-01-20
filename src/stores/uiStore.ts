import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";
import type { Embed } from "@/types/bluesky";

interface ReplyToInfo {
  uri: string;
  cid: string;
  authorHandle: string;
  text: string;
  embed?: Embed;
}

interface QuotePostInfo {
  uri: string;
  cid: string;
  authorHandle: string;
  text: string;
  embed?: Embed;
}

interface UIState {
  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Modal
  activeModal: string | null;
  openModal: (modalId: string) => void;
  closeModal: () => void;

  // Post Modal
  isPostModalOpen: boolean;
  replyTo: ReplyToInfo | null;
  quotePost: QuotePostInfo | null;
  openPostModal: (options?: { replyTo?: ReplyToInfo; quotePost?: QuotePostInfo }) => void;
  closePostModal: () => void;

  // Theme
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  // Chat unread count
  chatUnreadCount: number;
  setChatUnreadCount: (count: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    immer((set) => ({
      // Sidebar
      isSidebarOpen: true,
      toggleSidebar: () =>
        set((state) => {
          state.isSidebarOpen = !state.isSidebarOpen;
        }),
      setSidebarOpen: (open) =>
        set((state) => {
          state.isSidebarOpen = open;
        }),

      // Modal
      activeModal: null,
      openModal: (modalId) =>
        set((state) => {
          state.activeModal = modalId;
        }),
      closeModal: () =>
        set((state) => {
          state.activeModal = null;
        }),

      // Post Modal
      isPostModalOpen: false,
      replyTo: null,
      quotePost: null,
      openPostModal: (options) =>
        set((state) => {
          state.isPostModalOpen = true;
          state.replyTo = options?.replyTo ?? null;
          state.quotePost = options?.quotePost ?? null;
        }),
      closePostModal: () =>
        set((state) => {
          state.isPostModalOpen = false;
          state.replyTo = null;
          state.quotePost = null;
        }),

      // Theme
      theme: "dark",
      setTheme: (theme) =>
        set((state) => {
          state.theme = theme;
        }),

      // Chat unread count
      chatUnreadCount: 0,
      setChatUnreadCount: (count) =>
        set((state) => {
          state.chatUnreadCount = count;
        }),
    })),
    {
      name: "ui-store",
      partialize: (state) => ({
        theme: state.theme,
        isSidebarOpen: state.isSidebarOpen,
      }),
    },
  ),
);

// Atomic selectors for optimal re-renders (as documented in AGENTS.md)
export const selectIsSidebarOpen = (state: UIState) => state.isSidebarOpen;
export const selectActiveModal = (state: UIState) => state.activeModal;
export const selectTheme = (state: UIState) => state.theme;
export const selectIsPostModalOpen = (state: UIState) => state.isPostModalOpen;
export const selectReplyTo = (state: UIState) => state.replyTo;
export const selectQuotePost = (state: UIState) => state.quotePost;
export const selectClosePostModal = (state: UIState) => state.closePostModal;
export const selectChatUnreadCount = (state: UIState) => state.chatUnreadCount;
export const selectSetChatUnreadCount = (state: UIState) => state.setChatUnreadCount;
