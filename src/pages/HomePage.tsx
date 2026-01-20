import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PostItem } from "@/components/post/PostItem";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { useTimelineInfinite } from "@/hooks/useBluesky";
import { usePostActions } from "@/hooks/usePostActions";
import { mapTimelinePostToPost } from "@/lib/mappers";

import {
  useAuthStore,
  selectIsAuthenticated,
  selectIsCheckingSession,
} from "@/stores/authStore";

export default function HomePage() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isCheckingSession = useAuthStore(selectIsCheckingSession);

  // Fetch timeline only when authenticated
  const {
    data,
    isLoading,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTimelineInfinite();
  const { toggleLike, toggleRepost, isLikePending, isRepostPending } = usePostActions();
  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  // Show loading while checking session
  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Not authenticated - show welcome screen
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <h1 className="text-4xl font-bold tracking-tight">Blue Horizon</h1>
        <p className="text-muted-foreground text-center max-w-md">
          A multiplatform Bluesky client
        </p>
        <div className="flex gap-4">
          <Button asChild>
            <Link to="/welcome">Sign In</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings">Settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Loading timeline
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <h1 className="text-xl font-bold">Home</h1>
        </header>
        <FeedSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-red-500 mb-4">Failed to load timeline</p>
        <p className="text-muted-foreground text-sm mb-4">{error.message}</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  // Empty state
  if (!posts.length) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <h1 className="text-xl font-bold">Home</h1>
        </header>
        <div className="p-8 text-center text-muted-foreground">
          <p>No posts yet. Follow some people to see their posts here!</p>
        </div>
      </div>
    );
  }

  // Show timeline
  return (
    <div className="max-w-2xl mx-auto">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
        <h1 className="text-xl font-bold">Home</h1>
      </header>

      <div>
        {posts.map((timelinePost, index) => {
          const post = mapTimelinePostToPost(timelinePost);
          return (
            <PostItem
              key={`${post.uri}-${index}`}
              post={post}
              onLike={() => toggleLike(post)}
              onRepost={() => toggleRepost(post)}
              isLikeLoading={isLikePending(post.uri)}
              isRepostLoading={isRepostPending(post.uri)}
            />
          );
        })}
      </div>

      {hasNextPage && (
        <div className="p-4 text-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
