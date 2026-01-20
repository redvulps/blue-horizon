import { UserAvatar } from "@/components/user/UserAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

interface ListCardProps {
  uri: string;
  name: string;
  purpose: string;
  description?: string | null;
  avatar?: string | null;
  creatorHandle: string;
  creatorDisplayName?: string | null;
  memberCount: number;
  onSelect?: () => void;
  onEdit?: () => void;
  className?: string;
}

const purposeLabels: Record<string, { label: string; color: string }> = {
  "app.bsky.graph.defs#curatelist": { label: "Users", color: "text-blue-500" },
  "app.bsky.graph.defs#modlist": {
    label: "Moderation",
    color: "text-orange-500",
  },
  "app.bsky.graph.defs#referencelist": {
    label: "Reference",
    color: "text-purple-500",
  },
};

export function ListCard({
  name,
  purpose,
  description,
  avatar,
  creatorHandle,
  creatorDisplayName,
  memberCount,
  onSelect,
  onEdit,
  className,
}: ListCardProps) {
  const creatorLabel = creatorDisplayName || creatorHandle;
  const purposeInfo = purposeLabels[purpose] || {
    label: purpose,
    color: "text-muted-foreground",
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <div
      className={cn(
        "p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group",
        className,
      )}
      onClick={onSelect}
    >
      <div className="flex gap-3">
        <UserAvatar src={avatar} alt={name} size="lg" className="rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{name}</h3>
            <span className={cn("text-xs font-medium", purposeInfo.color)}>
              {purposeInfo.label}
            </span>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleEditClick}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">by @{creatorLabel}</p>
          {description && <p className="text-sm mt-1 line-clamp-2">{description}</p>}
          <div className="mt-2 text-xs text-muted-foreground">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </div>
        </div>
      </div>
    </div>
  );
}
