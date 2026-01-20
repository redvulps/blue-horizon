import { Button } from "@/components/ui/button";
import { HeartIcon } from "@/components/icons/HeartIcon";
import { ReplyIcon } from "@/components/icons/ReplyIcon";
import { RepostIcon } from "@/components/icons/RepostIcon";
import { ShareIcon } from "@/components/icons/ShareIcon";
import { QuoteIcon } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import type { Embed } from "@/types/bluesky";

interface PostActionsProps {
  uri: string;
  cid: string;
  authorHandle: string;
  text: string;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  embed?: Embed;
  isReposted?: boolean;
  isLiked?: boolean;
  isLikeLoading?: boolean;
  isRepostLoading?: boolean;
  onReply?: (e: React.MouseEvent) => void;
  onRepost?: (e: React.MouseEvent) => void;
  onLike?: (e: React.MouseEvent) => void;
  onShare?: (e: React.MouseEvent) => void;
  className?: string;
}

export function PostActions({
  uri,
  cid,
  authorHandle,
  text,
  replyCount,
  repostCount,
  likeCount,
  embed,
  isReposted = false,
  isLiked = false,
  isLikeLoading = false,
  isRepostLoading = false,
  onReply,
  onRepost,
  onLike,
  onShare,
  className,
}: PostActionsProps) {
  const openPostModal = useUIStore((state) => state.openPostModal);

  const handleQuote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openPostModal({
      quotePost: { uri, cid, authorHandle, text, embed },
    });
  };

  return (
    <div className={cn("flex items-center justify-between max-w", className)}>
      {/* Reply */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-primary"
        onClick={onReply}
      >
        <ReplyIcon />
        <span className="text-xs">{formatCount(replyCount, { hideZero: true })}</span>
      </Button>

      {/* Repost */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "gap-1.5",
          isReposted
            ? "text-green-500 hover:text-green-600"
            : "text-muted-foreground hover:text-green-500",
        )}
        disabled={isRepostLoading}
        onClick={onRepost}
      >
        <RepostIcon />
        <span className="text-xs">{formatCount(repostCount, { hideZero: true })}</span>
      </Button>

      {/* Quote */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-primary"
        onClick={handleQuote}
      >
        <QuoteIcon className="size-4" />
      </Button>

      {/* Like */}
      <Button
        variant="ghost"
        size="sm"
        disabled={isLikeLoading}
        className={cn(
          "gap-1.5 transition-all duration-200",
          isLiked
            ? "text-red-500 hover:text-red-600"
            : "text-muted-foreground hover:text-red-500",
          isLikeLoading && "opacity-50 cursor-not-allowed",
        )}
        onClick={onLike}
      >
        <HeartIcon
          filled={isLiked}
          className={cn(
            "transition-transform duration-200",
            isLikeLoading && "animate-pulse scale-110",
          )}
        />
        <span className="text-xs">{formatCount(likeCount, { hideZero: true })}</span>
      </Button>

      {/* Share */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-primary"
        onClick={onShare}
      >
        <ShareIcon />
      </Button>
    </div>
  );
}
