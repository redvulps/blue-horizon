import { UserAvatar } from "@/components/user/UserAvatar";
import { UserBadge } from "@/components/user/UserBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import type { Author } from "@/types/bluesky";
import { cn } from "@/lib/utils";

interface PostHeaderProps {
  author: Author;
  createdAt: string;
  isRepost?: boolean;
  repostedByHandle?: string;
  repostedByDisplayName?: string;
  className?: string;
}

export function PostHeader({
  author,
  createdAt,
  isRepost = false,
  repostedByHandle,
  repostedByDisplayName,
  className,
}: PostHeaderProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {isRepost && (
        <div className="flex items-center gap-2 pl-[52px]">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
              "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            Repost
          </span>
          {repostedByHandle && (
            <span className="text-xs text-muted-foreground truncate">
              by @{repostedByDisplayName || repostedByHandle}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <UserAvatar
          src={author.avatar}
          alt={author.displayName || author.handle}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <UserBadge
              displayName={author.displayName}
              handle={author.handle}
              did={author.did}
              truncate
            />
            <span className="text-muted-foreground">·</span>
            <RelativeTime
              date={createdAt}
              className="text-sm text-muted-foreground hover:underline cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
