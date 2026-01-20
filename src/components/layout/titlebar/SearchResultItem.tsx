import { FileText, User } from "lucide-react";
import { UserAvatar } from "@/components/user/UserAvatar";
import { cn } from "@/lib/utils";
import type { SearchResultAuthor, SearchResultPost } from "@/lib/search";

interface SearchResultItemProps {
  type: "actor" | "post";
  actor?: SearchResultAuthor;
  post?: SearchResultPost;
  isSelected: boolean;
  onClick: () => void;
}

export function SearchResultItem({
  type,
  actor,
  post,
  isSelected,
  onClick,
}: SearchResultItemProps) {
  if (type === "actor" && actor) {
    return (
      <button
        className={cn(
          "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50",
        )}
        onClick={onClick}
      >
        <UserAvatar
          src={actor.avatar}
          alt={actor.displayName || actor.handle}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{actor.displayName || actor.handle}</p>
          <p className="text-sm text-muted-foreground truncate">@{actor.handle}</p>
        </div>
        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
    );
  }

  if (type === "post" && post) {
    return (
      <button
        className={cn(
          "w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50",
        )}
        onClick={onClick}
      >
        <UserAvatar
          src={post.author.avatar}
          alt={post.author.displayName || post.author.handle}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">@{post.author.handle}</p>
          <p className="text-sm line-clamp-2">{post.text}</p>
        </div>
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
      </button>
    );
  }

  return null;
}
