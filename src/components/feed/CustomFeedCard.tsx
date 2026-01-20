import { UserAvatar } from "@/components/user/UserAvatar";
import { cn } from "@/lib/utils";

interface CustomFeedCardProps {
  uri: string;
  displayName: string;
  description?: string | null;
  avatar?: string | null;
  creatorHandle: string;
  creatorDisplayName?: string | null;
  likeCount: number;
  isSaved?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function CustomFeedCard({
  displayName,
  description,
  avatar,
  creatorHandle,
  creatorDisplayName,
  likeCount,
  isSaved = false,
  onSelect,
  className,
}: CustomFeedCardProps) {
  const creatorLabel = creatorDisplayName || creatorHandle;

  return (
    <div
      className={cn(
        "p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer",
        className,
      )}
      onClick={onSelect}
    >
      <div className="flex gap-3">
        <UserAvatar src={avatar} alt={displayName} size="lg" className="rounded-lg" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{displayName}</h3>
          <p className="text-sm text-muted-foreground truncate">by @{creatorLabel}</p>
          {description && <p className="text-sm mt-1 line-clamp-2">{description}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>♥ {likeCount.toLocaleString()}</span>
            {isSaved && <span className="text-green-500 font-medium">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
