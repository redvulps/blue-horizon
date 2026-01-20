import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostItem } from "@/components/post/PostItem";
import { getPostThread, type ThreadResponse, type ThreadPost } from "@/lib/api";
import type { Post, Author } from "@/types/bluesky";
import { usePostActions } from "@/hooks/usePostActions";

function mapThreadPostToPost(tp: ThreadPost): Post {
  const author: Author = {
    did: tp.author_did,
    handle: tp.author_handle,
    displayName: tp.author_display_name ?? undefined,
    avatar: tp.author_avatar ?? undefined,
  };

  return {
    uri: tp.uri,
    cid: tp.cid,
    author,
    record: {
      $type: "app.bsky.feed.post",
      text: tp.text,
      createdAt: tp.created_at,
    },
    embed: tp.embed ?? undefined,
    replyCount: tp.reply_count,
    repostCount: tp.repost_count,
    likeCount: tp.like_count,
    indexedAt: tp.created_at,
    viewer: {
      like: tp.viewer_like ?? undefined,
      repost: tp.viewer_repost ?? undefined,
    },
  };
}

function ThreadSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="border-t pt-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="pl-12 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadReply({
  thread,
  depth = 0,
  onLike,
  onRepost,
  isLikeLoading,
  isRepostLoading,
}: {
  thread: ThreadResponse;
  depth?: number;
  onLike: (post: Post) => void;
  onRepost: (post: Post) => void;
  isLikeLoading: (uri: string) => boolean;
  isRepostLoading: (uri: string) => boolean;
}) {
  const maxDepth = 5;
  const post = mapThreadPostToPost(thread.post);

  return (
    <div className={depth > 0 ? "border-l-2 border-muted ml-4 pl-4" : ""}>
      <PostItem
        post={post}
        onLike={() => onLike(post)}
        onRepost={() => onRepost(post)}
        isLikeLoading={isLikeLoading(post.uri)}
        isRepostLoading={isRepostLoading(post.uri)}
      />
      {depth < maxDepth &&
        thread.replies.map((reply, index) => (
          <ThreadReply
            key={`${reply.post.uri}-${depth}-${index}`}
            thread={reply}
            depth={depth + 1}
            onLike={onLike}
            onRepost={onRepost}
            isLikeLoading={isLikeLoading}
            isRepostLoading={isRepostLoading}
          />
        ))}
    </div>
  );
}

export default function PostThreadPage() {
  const { "*": uri } = useParams();
  const { toggleLike, toggleRepost, isLikePending, isRepostPending } = usePostActions();

  const fullUri = uri ? `at://${uri}` : "";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["post-thread", fullUri],
    queryFn: () => getPostThread(fullUri, 10),
    enabled: !!fullUri,
    staleTime: 1000 * 60 * 5,
  });

  if (!fullUri) {
    return (
      <div className="min-h-screen p-4 text-center">
        <p className="text-muted-foreground">Invalid post URL</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/">← Back to Home</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Post</h1>
          </div>
        </header>
        <ThreadSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-red-500 mb-4">Failed to load thread</p>
        <p className="text-muted-foreground text-sm mb-4">{error.message}</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => refetch()}>Retry</Button>
          <Button variant="ghost" asChild>
            <Link to="/">← Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-muted-foreground">Post not found</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/">← Back to Home</Link>
        </Button>
      </div>
    );
  }

  // Flatten parent chain for display
  const parentChain: ThreadResponse[] = [];
  let current = data.parent;
  while (current) {
    parentChain.unshift(current);
    current = current.parent;
  }
  const mainPost = mapThreadPostToPost(data.post);

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Post</h1>
          </div>
        </header>

        {/* Parent chain */}
        {parentChain.length > 0 && (
          <div className="border-b opacity-75">
            {parentChain.map((parent, index) => {
              const post = mapThreadPostToPost(parent.post);
              return (
                <PostItem
                  key={`parent-${parent.post.uri}-${index}`}
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

        {/* Main post */}
        <div className="border-b-2 border-primary/20">
          <PostItem
            post={mainPost}
            onLike={() => toggleLike(mainPost)}
            onRepost={() => toggleRepost(mainPost)}
            isLikeLoading={isLikePending(mainPost.uri)}
            isRepostLoading={isRepostPending(mainPost.uri)}
          />
        </div>

        {/* Replies */}
        {data.replies.length > 0 && (
          <div className="pt-2">
            {data.replies.map((reply, index) => (
              <ThreadReply
                key={`reply-${reply.post.uri}-${index}`}
                thread={reply}
                onLike={toggleLike}
                onRepost={toggleRepost}
                isLikeLoading={isLikePending}
                isRepostLoading={isRepostPending}
              />
            ))}
          </div>
        )}

        {data.replies.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p>No replies yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
