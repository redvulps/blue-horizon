import { useParams, useLocation } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostItem } from "@/components/post/PostItem";
import { getFeed, type FeedInfo } from "@/lib/feeds";
import { mapTimelinePostToPost } from "@/lib/mappers";
import { usePostActions } from "@/hooks/usePostActions";

function FeedPostsSkeleton() {
  return (
    <div className="divide-y">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function FeedDetailsPage() {
  const { feedUri } = useParams<{ feedUri: string }>();
  const location = useLocation();

  const decodedUri = feedUri ? decodeURIComponent(feedUri) : "";

  // Try to get feed info from location state if available
  const feedInfo = location.state as FeedInfo | undefined;

  const {
    data,
    isLoading,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["feed-posts", decodedUri],
    queryFn: ({ pageParam }) => getFeed(decodedUri, 50, pageParam),
    enabled: !!decodedUri,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  const { toggleLike, toggleRepost, isLikePending, isRepostPending } = usePostActions();

  if (!decodedUri) {
    return <div className="p-8 text-center text-red-500">Invalid Feed URI</div>;
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center gap-4">
          <h1 className="text-xl font-bold truncate">
            {feedInfo?.display_name ?? "Feed"}
          </h1>
        </header>

        {feedInfo && (
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              {feedInfo.avatar ? (
                <img
                  src={feedInfo.avatar}
                  alt={feedInfo.display_name}
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {feedInfo.display_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate">
                  {feedInfo.display_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  by {feedInfo.creator_handle}
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>♥ {feedInfo.like_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
            {feedInfo.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {feedInfo.description}
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <FeedPostsSkeleton />
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-500 mb-4">Failed to load feed posts</p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        ) : !posts.length ? (
          <div className="p-8 text-center text-muted-foreground">
            No posts in this feed yet
          </div>
        ) : (
          <div className="divide-y">
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
        )}

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
    </div>
  );
}
