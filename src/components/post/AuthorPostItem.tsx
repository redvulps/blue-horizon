import { useNavigate } from "react-router-dom";
import { PostHeader } from "./PostHeader";
import { PostActions } from "./PostActions";
import { PostEmbed } from "./PostEmbed";
import type { TimelinePost } from "@/lib/api";
import type { Author } from "@/types/bluesky";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

interface AuthorPostItemProps {
  post: TimelinePost;
  onReply?: () => void;
  onRepost?: () => void;
  onLike?: () => void;
  onShare?: () => void;
  isLikeLoading?: boolean;
  isRepostLoading?: boolean;
  className?: string;
}

function getPostPath(uri: string): string {
  if (uri.startsWith("at://")) {
    return `/post/${uri.slice(5)}`;
  }
  return `/post/${uri}`;
}

const INTERACTIVE_SELECTOR = "a, button, input, textarea, select, [role='button']";

export function AuthorPostItem({
  post,
  onReply,
  onRepost,
  onLike,
  onShare,
  isLikeLoading = false,
  isRepostLoading = false,
  className,
}: AuthorPostItemProps) {
  const navigate = useNavigate();
  const handleLikeClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onLike?.();
    },
    [onLike],
  );
  const handleReplyClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onReply?.();
    },
    [onReply],
  );
  const handleRepostClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onRepost?.();
    },
    [onRepost],
  );
  const handleShareClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onShare?.();
    },
    [onShare],
  );
  const postPath = getPostPath(post.uri);
  const author: Author = {
    did: post.author_did,
    handle: post.author_handle,
    displayName: post.author_display_name ?? undefined,
    avatar: post.author_avatar ?? undefined,
  };

  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      const interactive = target.closest(INTERACTIVE_SELECTOR);
      if (interactive && interactive !== e.currentTarget) return;
      navigate(postPath);
    },
    [navigate, postPath],
  );

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement;
      const interactive = target.closest(INTERACTIVE_SELECTOR);
      if (interactive && interactive !== e.currentTarget) return;
      e.preventDefault();
      navigate(postPath);
    },
    [navigate, postPath],
  );

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "block cursor-pointer px-4 py-3 border-b hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <PostHeader
        author={author}
        createdAt={post.created_at}
        isRepost={post.is_repost}
        repostedByHandle={post.reposted_by_handle ?? undefined}
        repostedByDisplayName={post.reposted_by_display_name ?? undefined}
      />

      {/* Post Content */}
      <div className="pl-[52px]">
        <div className="mt-1 whitespace-pre-wrap break-words">{post.text}</div>

        {/* Post Embed */}
        {post.embed && <PostEmbed embed={post.embed || undefined} />}

        {/* Post Actions */}
        <PostActions
          uri={post.uri}
          cid={post.cid}
          authorHandle={post.author_handle}
          text={post.text}
          embed={post.embed || undefined}
          replyCount={post.reply_count}
          repostCount={post.repost_count}
          likeCount={post.like_count}
          isReposted={post.is_reposted}
          isLiked={post.is_liked}
          isLikeLoading={isLikeLoading}
          isRepostLoading={isRepostLoading}
          onReply={handleReplyClick}
          onRepost={handleRepostClick}
          onLike={handleLikeClick}
          onShare={handleShareClick}
          className="mt-3"
        />
      </div>
    </article>
  );
}
