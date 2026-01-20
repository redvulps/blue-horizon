import { cn, formatCount } from "@/lib/utils";

interface UserStatsProps {
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  className?: string;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

export function UserStats({
  followersCount = 0,
  followsCount = 0,
  postsCount = 0,
  className,
  onFollowersClick,
  onFollowingClick,
}: UserStatsProps) {
  return (
    <div className={cn("flex gap-4 text-sm", className)}>
      {onFollowersClick ? (
        <button
          type="button"
          onClick={onFollowersClick}
          className="flex gap-1 hover:underline underline-offset-4"
        >
          <span className="font-semibold text-foreground">
            {formatCount(followersCount)}
          </span>
          <span className="text-muted-foreground">followers</span>
        </button>
      ) : (
        <div className="flex gap-1">
          <span className="font-semibold text-foreground">
            {formatCount(followersCount)}
          </span>
          <span className="text-muted-foreground">followers</span>
        </div>
      )}
      {onFollowingClick ? (
        <button
          type="button"
          onClick={onFollowingClick}
          className="flex gap-1 hover:underline underline-offset-4"
        >
          <span className="font-semibold text-foreground">
            {formatCount(followsCount)}
          </span>
          <span className="text-muted-foreground">following</span>
        </button>
      ) : (
        <div className="flex gap-1">
          <span className="font-semibold text-foreground">
            {formatCount(followsCount)}
          </span>
          <span className="text-muted-foreground">following</span>
        </div>
      )}
      <div className="flex gap-1">
        <span className="font-semibold text-foreground">{formatCount(postsCount)}</span>
        <span className="text-muted-foreground">posts</span>
      </div>
    </div>
  );
}
