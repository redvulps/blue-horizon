import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostItem } from "@/components/post/PostItem";
import { Loader2, X } from "lucide-react";
import type { ListFeedPost, ListMember } from "@/lib/feeds";
import type { Post } from "@/types/bluesky";
import type { MouseEvent } from "react";

export function ListHeaderSkeleton() {
  return (
    <div className="p-4 border-b space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

export function MembersSkeleton() {
  return (
    <div className="divide-y">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListFeedSkeleton() {
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

interface ListMemberItemProps {
  member: ListMember;
  onRemove?: (member: ListMember) => void;
  isRemoving?: boolean;
}

export function ListMemberItem({ member, onRemove, isRemoving }: ListMemberItemProps) {
  const handleRemove = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.(member);
  };

  return (
    <div className="flex items-center hover:bg-accent transition-colors group">
      <Link
        to={`/profile/${member.handle}`}
        className="p-4 flex items-center gap-3 flex-1 min-w-0"
      >
        {member.avatar ? (
          <img
            src={member.avatar}
            alt={member.handle}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-medium">
            {member.handle[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{member.display_name || member.handle}</p>
          <p className="text-sm text-muted-foreground truncate">@{member.handle}</p>
        </div>
      </Link>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleRemove}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function mapListFeedPostToPost(feedPost: ListFeedPost): Post {
  return {
    uri: feedPost.uri,
    cid: feedPost.cid,
    author: {
      did: feedPost.author_did,
      handle: feedPost.author_handle,
      displayName: feedPost.author_display_name ?? undefined,
      avatar: feedPost.author_avatar ?? undefined,
    },
    isRepost: feedPost.is_repost,
    repostedByHandle: feedPost.reposted_by_handle ?? undefined,
    repostedByDisplayName: feedPost.reposted_by_display_name ?? undefined,
    record: {
      $type: "app.bsky.feed.post",
      text: feedPost.text,
      createdAt: feedPost.created_at,
    },
    replyCount: feedPost.reply_count,
    repostCount: feedPost.repost_count,
    likeCount: feedPost.like_count,
    indexedAt: feedPost.created_at,
    viewer: {
      like: feedPost.viewer_like ?? undefined,
      repost: feedPost.viewer_repost ?? undefined,
    },
  };
}

interface ListFeedItemProps {
  post: ListFeedPost;
}

export function ListFeedItem({ post }: ListFeedItemProps) {
  return <PostItem post={mapListFeedPostToPost(post)} />;
}
