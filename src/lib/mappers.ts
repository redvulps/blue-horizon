import type { Post, Author } from "@/types/bluesky";
import type { TimelinePost } from "@/lib/api";

export const mapTimelinePostToPost = (tp: TimelinePost): Post => {
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
    isRepost: tp.is_repost,
    repostedByHandle: tp.reposted_by_handle ?? undefined,
    repostedByDisplayName: tp.reposted_by_display_name ?? undefined,
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
};
