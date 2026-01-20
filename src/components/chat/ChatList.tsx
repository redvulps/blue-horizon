import { UserAvatar } from "@/components/user/UserAvatar";
import { cn, formatMessageTime } from "@/lib/utils";
import type { ConversationInfo } from "@/lib/chat";

interface ChatListItemProps {
  conversation: ConversationInfo;
  currentUserDid?: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function ChatListItem({
  conversation,
  currentUserDid,
  isSelected,
  onSelect,
}: ChatListItemProps) {
  // Find the other participant(s)
  const otherMembers = conversation.members.filter((m) => m.did !== currentUserDid);
  const displayMember = otherMembers[0] || conversation.members[0];

  const displayName =
    otherMembers.length > 1
      ? `${displayMember?.display_name || displayMember?.handle} +${otherMembers.length - 1}`
      : displayMember?.display_name || displayMember?.handle || "Unknown";

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors",
        isSelected && "bg-muted",
        conversation.unread_count > 0 && "font-medium",
      )}
    >
      <UserAvatar src={displayMember?.avatar} alt={displayName} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="truncate">{displayName}</span>
          {conversation.last_message && (
            <span className="text-xs text-muted-foreground">
              {formatMessageTime(conversation.last_message.sent_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground truncate flex-1">
            {conversation.last_message?.text || "No messages"}
          </p>
          {conversation.unread_count > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChatListProps {
  conversations: ConversationInfo[];
  currentUserDid?: string;
  selectedId?: string;
  onSelectConversation?: (id: string) => void;
}

export function ChatList({
  conversations,
  currentUserDid,
  selectedId,
  onSelectConversation,
}: ChatListProps) {
  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((convo) => (
        <ChatListItem
          key={convo.id}
          conversation={convo}
          currentUserDid={currentUserDid}
          isSelected={convo.id === selectedId}
          onSelect={() => onSelectConversation?.(convo.id)}
        />
      ))}
    </div>
  );
}
