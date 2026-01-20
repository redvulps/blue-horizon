import { UserAvatar } from "@/components/user/UserAvatar";
import { cn, formatMessageTime } from "@/lib/utils";
import type { ConversationMember, MessageInfo } from "@/lib/chat";

interface ChatMessageProps {
  message: MessageInfo;
  isOwn: boolean;
  sender?: ConversationMember;
}

export function ChatMessage({ message, isOwn, sender }: ChatMessageProps) {
  const time = formatMessageTime(message.sent_at);

  return (
    <div className={cn("flex gap-2 mb-3", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <UserAvatar
          src={sender?.avatar}
          alt={sender?.display_name || sender?.handle || "User"}
          size="sm"
        />
      )}
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={cn(
            "text-xs mt-1",
            isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
