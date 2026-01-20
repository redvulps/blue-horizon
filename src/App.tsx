import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Titlebar } from "@/components/layout/Titlebar";
import { NewPostModal } from "@/components/post/NewPostModal";
import { ToastViewport } from "@/components/ui/feedback/ToastViewport";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import {
  useUIStore,
  selectIsPostModalOpen,
  selectReplyTo,
  selectQuotePost,
  selectClosePostModal,
} from "@/stores/uiStore";
import { RefreshProvider } from "@/contexts/RefreshContext";
import { lazy, Suspense, type ReactElement, useEffect } from "react";

const HomePage = lazy(() => import("@/pages/HomePage"));
const WelcomePage = lazy(() => import("@/pages/WelcomePage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const FeedsPage = lazy(() => import("@/pages/FeedsPage"));
const FeedDetailsPage = lazy(() => import("@/pages/FeedDetailsPage"));
const ListsPage = lazy(() => import("@/pages/ListsPage"));
const ListDetailPage = lazy(() => import("@/pages/ListDetailPage"));
const PostThreadPage = lazy(() => import("@/pages/PostThreadPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function PostModal() {
  const isOpen = useUIStore(selectIsPostModalOpen);
  const replyTo = useUIStore(selectReplyTo);
  const quotePost = useUIStore(selectQuotePost);
  const closePostModal = useUIStore(selectClosePostModal);

  return (
    <NewPostModal
      open={isOpen}
      onOpenChange={closePostModal}
      replyTo={replyTo}
      quotePost={quotePost}
    />
  );
}

function RootLayout() {
  useTheme();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <QueryClientProvider client={queryClient}>
      <RefreshProvider>
        <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
          <Titlebar />
          <div className="flex-1 flex min-h-0">
            {isAuthenticated && <Sidebar />}
            <main className="flex-1 min-w-0 md:pl-0 pb-16 md:pb-0 overflow-auto">
              <Outlet />
            </main>
            {isAuthenticated && <BottomNav />}
          </div>
          <PostModal />
          <ToastViewport />
        </div>
      </RefreshProvider>
    </QueryClientProvider>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}

function withSuspense(element: ReactElement) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: withSuspense(<HomePage />),
      },
      {
        path: "welcome",
        element: withSuspense(<WelcomePage />),
      },
      {
        path: "profile",
        element: withSuspense(<ProfilePage />),
      },
      {
        path: "profile/:handle",
        element: withSuspense(<ProfilePage />),
      },
      {
        path: "post/*",
        element: withSuspense(<PostThreadPage />),
      },
      {
        path: "feeds",
        element: withSuspense(<FeedsPage />),
      },
      {
        path: "feeds/:feedUri",
        element: withSuspense(<FeedDetailsPage />),
      },
      {
        path: "lists",
        element: withSuspense(<ListsPage />),
      },
      {
        path: "lists/:listUri",
        element: withSuspense(<ListDetailPage />),
      },
      {
        path: "chat",
        element: withSuspense(<ChatPage />),
      },
      {
        path: "notifications",
        element: withSuspense(<NotificationsPage />),
      },
      {
        path: "settings",
        element: withSuspense(<SettingsPage />),
      },
      {
        path: "search",
        element: withSuspense(<SearchPage />),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
