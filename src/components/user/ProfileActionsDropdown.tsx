import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreHorizontal,
  Copy,
  Search,
  ListPlus,
  VolumeX,
  Volume2,
  Ban,
  CircleSlash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { muteActor, unmuteActor, blockActor, unblockActor } from "@/lib/api";

interface ProfileActionsDropdownProps {
  handle: string;
  did: string;
  isMuted: boolean;
  isBlocked: boolean;
  blockingUri: string | null;
  onMuteChange?: (muted: boolean) => void;
  onBlockChange?: (blocked: boolean, blockUri: string | null) => void;
  onAddToList?: () => void;
}

export function ProfileActionsDropdown({
  handle,
  did,
  isMuted,
  isBlocked,
  blockingUri,
  onMuteChange,
  onBlockChange,
  onAddToList,
}: ProfileActionsDropdownProps) {
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCopyLink = async () => {
    const profileUrl = `https://bsky.app/profile/${handle}`;
    try {
      await navigator.clipboard.writeText(profileUrl);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const handleSearchPosts = () => {
    const cleanHandle = handle.replace(/^@/, "");
    navigate(`/search?q=from:${cleanHandle}`);
  };

  const handleAddToList = () => {
    if (onAddToList) {
      onAddToList();
    } else {
      navigate(`/lists?add=${did}`);
    }
  };

  const handleToggleMute = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      if (isMuted) {
        await unmuteActor(did);
        onMuteChange?.(false);
      } else {
        await muteActor(did);
        onMuteChange?.(true);
      }
    } catch (error) {
      console.error("Failed to toggle mute:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleBlock = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      if (isBlocked && blockingUri) {
        await unblockActor(blockingUri);
        onBlockChange?.(false, null);
      } else {
        const uri = await blockActor(did);
        onBlockChange?.(true, uri);
      }
    } catch (error) {
      console.error("Failed to toggle block:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">More actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopyLink}>
          <Copy className="mr-2 h-4 w-4" />
          Copy link to profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSearchPosts}>
          <Search className="mr-2 h-4 w-4" />
          Search posts
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleAddToList}>
          <ListPlus className="mr-2 h-4 w-4" />
          Add to list
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleToggleMute} disabled={isUpdating}>
          {isMuted ? (
            <>
              <Volume2 className="mr-2 h-4 w-4" />
              Unmute account
            </>
          ) : (
            <>
              <VolumeX className="mr-2 h-4 w-4" />
              Mute account
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleToggleBlock}
          disabled={isUpdating}
          className="text-destructive focus:text-destructive"
        >
          {isBlocked ? (
            <>
              <CircleSlash className="mr-2 h-4 w-4" />
              Unblock account
            </>
          ) : (
            <>
              <Ban className="mr-2 h-4 w-4" />
              Block account
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
