import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomFeedCard } from "@/components/feed/CustomFeedCard";
import { getSuggestedFeeds } from "@/lib/feeds";

function FeedsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 border rounded-lg">
          <div className="flex gap-3">
            <Skeleton className="h-14 w-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedsPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["suggested-feeds", cursor],
    queryFn: () => getSuggestedFeeds(cursor),
    staleTime: 1000 * 60 * 5,
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <h1 className="text-xl font-bold">Discover Feeds</h1>
        </header>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <FeedsSkeleton />
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-4">Failed to load feeds</p>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          ) : !data?.feeds.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No feeds available</p>
            </div>
          ) : (
            <>
              {data.feeds.map((feed) => (
                <CustomFeedCard
                  key={feed.uri}
                  uri={feed.uri}
                  displayName={feed.display_name}
                  description={feed.description}
                  avatar={feed.avatar}
                  creatorHandle={feed.creator_handle}
                  creatorDisplayName={feed.creator_display_name}
                  likeCount={feed.like_count}
                  isSaved={feed.is_saved}
                  onSelect={() =>
                    navigate(`/feeds/${encodeURIComponent(feed.uri)}`, {
                      state: feed,
                    })
                  }
                />
              ))}
              {data.cursor && (
                <div className="text-center py-4">
                  <Button
                    variant="outline"
                    onClick={() => setCursor(data.cursor || undefined)}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
