import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UserBadgeProps {
  displayName?: string | null;
  handle: string;
  className?: string;
  layout?: "horizontal" | "vertical";
  truncate?: boolean;
  did?: string; // Optional DID for more accurate profile linking
}

export function UserBadge({
  displayName,
  handle,
  className,
  layout = "horizontal",
  truncate = true,
  did,
}: UserBadgeProps) {
  const name = displayName || handle;
  const profileId = did || handle; // Use DID if available, otherwise handle

  return (
    <div
      className={cn(
        "flex gap-1",
        layout === "vertical" ? "flex-col" : "flex-row items-center",
        className,
      )}
    >
      <Link to={`/profile/${profileId}`} className="hover:underline">
        <span
          className={cn(
            "font-semibold text-foreground",
            truncate && "truncate max-w-[160px]",
          )}
          title={name}
        >
          {name}
        </span>
      </Link>
      <Link to={`/profile/${profileId}`} className="hover:underline">
        <span
          className={cn(
            "text-muted-foreground text-sm",
            truncate && "truncate max-w-[140px]",
          )}
          title={`@${handle}`}
        >
          @{handle}
        </span>
      </Link>
    </div>
  );
}
