import { useNavigate } from "react-router-dom";
import { PostHeader } from "./PostHeader";
import { PostContent } from "./PostContent";
import { PostEmbed } from "./PostEmbed";
import { PostActions } from "./PostActions";
import type { Post } from "@/types/bluesky";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

interface PostItemProps {
  post: Post;
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

export function PostItem({
  post,
  onReply,
  onRepost,
  onLike,
  onShare,
  isLikeLoading = false,
  isRepostLoading = false,
  className,
}: PostItemProps) {
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
        author={post.author}
        createdAt={post.record.createdAt}
        isRepost={post.isRepost}
        repostedByHandle={post.repostedByHandle}
        repostedByDisplayName={post.repostedByDisplayName}
      />

      <div className="pl-[52px]">
        <PostContent
          text={post.record.text}
          facets={post.record.facets}
          className="mt-1"
        />

        {post.embed && <PostEmbed embed={post.embed} />}

        <PostActions
          uri={post.uri}
          cid={post.cid}
          authorHandle={post.author.handle}
          text={post.record.text}
          embed={post.embed}
          replyCount={post.replyCount}
          repostCount={post.repostCount}
          likeCount={post.likeCount}
          isReposted={!!post.viewer?.repost}
          isLiked={!!post.viewer?.like}
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
