import { useCallback, useRef, useState } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ThreadPost,
  ThreadResponse,
  TimelinePost,
  TimelineResponse,
} from "@/lib/api";
import type { FeedPostsResponse } from "@/lib/feeds";
import type { Post } from "@/types/bluesky";
import { likePost, repostPost, unlikePost, unrepostPost } from "@/lib/api";

const OPTIMISTIC_LIKE_URI = "optimistic://like";
const OPTIMISTIC_REPOST_URI = "optimistic://repost";

function patchTimelinePosts<T extends { posts: TimelinePost[] }>(
  data: T | undefined,
  targetUri: string,
  update: (post: TimelinePost) => TimelinePost,
): T | undefined {
  if (!data) return data;

  let changed = false;
  const posts = data.posts.map((post) => {
    if (post.uri !== targetUri) return post;
    changed = true;
    return update(post);
  });

  if (!changed) return data;
  return { ...data, posts };
}

function patchInfiniteTimelinePosts<T extends { posts: TimelinePost[] }>(
  data: InfiniteData<T> | undefined,
  targetUri: string,
  update: (post: TimelinePost) => TimelinePost,
): InfiniteData<T> | undefined {
  if (!data) return data;

  let changed = false;
  const pages = data.pages.map((page) => {
    const nextPage = patchTimelinePosts(page, targetUri, update);
    if (nextPage !== page) changed = true;
    return nextPage ?? page;
  });

  if (!changed) return data;
  return { ...data, pages };
}

function patchThreadPost(
  data: ThreadResponse | undefined,
  targetUri: string,
  update: (post: ThreadPost) => ThreadPost,
): ThreadResponse | undefined {
  if (!data) return data;

  const patchNode = (node: ThreadResponse): [ThreadResponse, boolean] => {
    let changed = false;

    const nextPost = node.post.uri === targetUri ? update(node.post) : node.post;
    if (nextPost !== node.post) changed = true;

    let nextParent = node.parent;
    if (node.parent) {
      const [patchedParent, parentChanged] = patchNode(node.parent);
      nextParent = patchedParent;
      if (parentChanged) changed = true;
    }

    const nextReplies = node.replies.map((reply) => {
      const [patchedReply, replyChanged] = patchNode(reply);
      if (replyChanged) changed = true;
      return patchedReply;
    });

    if (!changed) return [node, false];

    return [
      {
        ...node,
        post: nextPost,
        parent: nextParent,
        replies: nextReplies,
      },
      true,
    ];
  };

  const [patched, changed] = patchNode(data);
  return changed ? patched : data;
}

function setPendingByUri(
  previous: Record<string, true>,
  uri: string,
  pending: boolean,
): Record<string, true> {
  if (pending) {
    if (previous[uri]) return previous;
    return { ...previous, [uri]: true };
  }

  if (!previous[uri]) return previous;
  const next = { ...previous };
  delete next[uri];
  return next;
}

export function usePostActions() {
  const queryClient = useQueryClient();
  const pendingLikeUrisRef = useRef<Record<string, true>>({});
  const pendingRepostUrisRef = useRef<Record<string, true>>({});
  const [pendingLikeUris, setPendingLikeUris] = useState<Record<string, true>>({});
  const [pendingRepostUris, setPendingRepostUris] = useState<Record<string, true>>({});

  const patchLikeCaches = useCallback(
    (targetUri: string, nextLiked: boolean) => {
      const likeDelta = nextLiked ? 1 : -1;
      const updateTimelineLike = (post: TimelinePost): TimelinePost => ({
        ...post,
        is_liked: nextLiked,
        like_count: Math.max(0, post.like_count + likeDelta),
        viewer_like: nextLiked ? (post.viewer_like ?? OPTIMISTIC_LIKE_URI) : null,
      });

      const updateThreadLike = (post: ThreadPost): ThreadPost => ({
        ...post,
        is_liked: nextLiked,
        like_count: Math.max(0, post.like_count + likeDelta),
        viewer_like: nextLiked ? (post.viewer_like ?? OPTIMISTIC_LIKE_URI) : null,
      });

      queryClient.setQueriesData<InfiniteData<TimelineResponse>>(
        { queryKey: ["timeline-infinite"] },
        (data) => patchInfiniteTimelinePosts(data, targetUri, updateTimelineLike),
      );
      queryClient.setQueriesData<FeedPostsResponse>({ queryKey: ["get-feed"] }, (data) =>
        patchTimelinePosts(data, targetUri, updateTimelineLike),
      );
      queryClient.setQueriesData<InfiniteData<FeedPostsResponse>>(
        { queryKey: ["feed-posts"] },
        (data) => patchInfiniteTimelinePosts(data, targetUri, updateTimelineLike),
      );
      queryClient.setQueriesData<TimelineResponse>(
        { queryKey: ["author_feed"] },
        (data) => patchTimelinePosts(data, targetUri, updateTimelineLike),
      );
      queryClient.setQueriesData<ThreadResponse>({ queryKey: ["post-thread"] }, (data) =>
        patchThreadPost(data, targetUri, updateThreadLike),
      );
    },
    [queryClient],
  );

  const patchRepostCaches = useCallback(
    (targetUri: string, nextReposted: boolean) => {
      const repostDelta = nextReposted ? 1 : -1;
      const updateTimelineRepost = (post: TimelinePost): TimelinePost => ({
        ...post,
        is_reposted: nextReposted,
        repost_count: Math.max(0, post.repost_count + repostDelta),
        viewer_repost: nextReposted
          ? (post.viewer_repost ?? OPTIMISTIC_REPOST_URI)
          : null,
      });

      const updateThreadRepost = (post: ThreadPost): ThreadPost => ({
        ...post,
        is_reposted: nextReposted,
        repost_count: Math.max(0, post.repost_count + repostDelta),
        viewer_repost: nextReposted
          ? (post.viewer_repost ?? OPTIMISTIC_REPOST_URI)
          : null,
      });

      queryClient.setQueriesData<InfiniteData<TimelineResponse>>(
        { queryKey: ["timeline-infinite"] },
        (data) => patchInfiniteTimelinePosts(data, targetUri, updateTimelineRepost),
      );
      queryClient.setQueriesData<FeedPostsResponse>({ queryKey: ["get-feed"] }, (data) =>
        patchTimelinePosts(data, targetUri, updateTimelineRepost),
      );
      queryClient.setQueriesData<InfiniteData<FeedPostsResponse>>(
        { queryKey: ["feed-posts"] },
        (data) => patchInfiniteTimelinePosts(data, targetUri, updateTimelineRepost),
      );
      queryClient.setQueriesData<TimelineResponse>(
        { queryKey: ["author_feed"] },
        (data) => patchTimelinePosts(data, targetUri, updateTimelineRepost),
      );
      queryClient.setQueriesData<ThreadResponse>({ queryKey: ["post-thread"] }, (data) =>
        patchThreadPost(data, targetUri, updateThreadRepost),
      );
    },
    [queryClient],
  );

  const reconcilePostQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["timeline-infinite"] });
    void queryClient.invalidateQueries({ queryKey: ["get-feed"] });
    void queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["author_feed"] });
    void queryClient.invalidateQueries({ queryKey: ["post-thread"] });
  }, [queryClient]);

  const setLikePending = useCallback((uri: string, pending: boolean) => {
    setPendingLikeUris((previous) => {
      const next = setPendingByUri(previous, uri, pending);
      pendingLikeUrisRef.current = next;
      return next;
    });
  }, []);

  const setRepostPending = useCallback((uri: string, pending: boolean) => {
    setPendingRepostUris((previous) => {
      const next = setPendingByUri(previous, uri, pending);
      pendingRepostUrisRef.current = next;
      return next;
    });
  }, []);

  const toggleLike = useCallback(
    (post: Post) => {
      void (async () => {
        if (pendingLikeUrisRef.current[post.uri]) return;

        const currentLikeUri = post.viewer?.like;
        const nextLiked = !currentLikeUri;
        const hasOptimisticLike =
          typeof currentLikeUri === "string" &&
          currentLikeUri.startsWith("optimistic://");

        if (!nextLiked && (!currentLikeUri || hasOptimisticLike)) {
          reconcilePostQueries();
          return;
        }

        setLikePending(post.uri, true);
        patchLikeCaches(post.uri, nextLiked);

        try {
          if (nextLiked) {
            await likePost(post.uri, post.cid);
          } else {
            await unlikePost(currentLikeUri!);
          }
        } catch (error) {
          console.error("Failed to toggle like:", error);
          patchLikeCaches(post.uri, !nextLiked);
        } finally {
          setLikePending(post.uri, false);
          reconcilePostQueries();
        }
      })();
    },
    [patchLikeCaches, reconcilePostQueries, setLikePending],
  );

  const toggleRepost = useCallback(
    (post: Post) => {
      void (async () => {
        if (pendingRepostUrisRef.current[post.uri]) return;

        const currentRepostUri = post.viewer?.repost;
        const nextReposted = !currentRepostUri;
        const hasOptimisticRepost =
          typeof currentRepostUri === "string" &&
          currentRepostUri.startsWith("optimistic://");

        if (!nextReposted && (!currentRepostUri || hasOptimisticRepost)) {
          reconcilePostQueries();
          return;
        }

        setRepostPending(post.uri, true);
        patchRepostCaches(post.uri, nextReposted);

        try {
          if (nextReposted) {
            await repostPost(post.uri, post.cid);
          } else {
            await unrepostPost(currentRepostUri!);
          }
        } catch (error) {
          console.error("Failed to toggle repost:", error);
          patchRepostCaches(post.uri, !nextReposted);
        } finally {
          setRepostPending(post.uri, false);
          reconcilePostQueries();
        }
      })();
    },
    [patchRepostCaches, reconcilePostQueries, setRepostPending],
  );

  return {
    toggleLike,
    toggleRepost,
    isLikePending: (uri: string) => Boolean(pendingLikeUris[uri]),
    isRepostPending: (uri: string) => Boolean(pendingRepostUris[uri]),
  };
}
