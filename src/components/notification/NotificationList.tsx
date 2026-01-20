import { useNavigate } from "react-router-dom";
import { Heart, Repeat, UserPlus, MessageCircle, Quote } from "lucide-react";
import { UserAvatar } from "@/components/user/UserAvatar";
import { cn } from "@/lib/utils";
import type { NotificationInfo } from "@/lib/notifications";

import { RelativeTime } from "@/components/shared/RelativeTime";

interface NotificationItemProps {
  notification: NotificationInfo;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const navigate = useNavigate();
  const { author, reason, record, is_read, indexed_at } = notification;
  const previewText = record && "text" in record ? record.text : null;

  const getIcon = () => {
    switch (reason) {
      case "like":
        return <Heart className="w-5 h-5 text-red-500 fill-red-500" />;
      case "repost":
        return <Repeat className="w-5 h-5 text-green-500" />;
      case "follow":
        return <UserPlus className="w-5 h-5 text-blue-500" />;
      case "reply":
      case "mention":
        return <MessageCircle className="w-5 h-5 text-blue-400" />;
      case "quote":
        return <Quote className="w-5 h-5 text-purple-500" />;
      default:
        return <div className="w-5 h-5" />;
    }
  };

  const getActionText = () => {
    switch (reason) {
      case "like":
        return "liked your post";
      case "repost":
        return "reposted your post";
      case "follow":
        return "followed you";
      case "reply":
        return "replied to you";
      case "mention":
        return "mentioned you";
      case "quote":
        return "quoted your post";
      default:
        return "";
    }
  };

  const handleClick = () => {
    // Navigate to post if applicable, or profile for follow
    if (reason === "follow") {
      navigate(`/profile/${author.handle}`);
    } else if (notification.reason_subject || notification.uri) {
      // If it's a like/repost, go to subject. If reply, go to the reply itself.
      const targetUri = notification.reason_subject || notification.uri;
      if (targetUri.startsWith("at://")) {
        navigate(`/post/${targetUri.slice(5)}`);
      }
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex gap-3 p-4 border-b hover:bg-muted/50 transition-colors cursor-pointer",
        !is_read && "bg-blue-50/5 dark:bg-blue-900/10",
      )}
    >
      <div className="flex flex-col items-end gap-1 min-w-[24px]">{getIcon()}</div>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <UserAvatar src={author.avatar} alt={author.handle} size="sm" />
          <span
            className="font-semibold text-sm hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/profile/${author.handle}`);
            }}
          >
            {author.display_name || author.handle}
          </span>
          <span className="text-muted-foreground text-sm">{getActionText()}</span>
          <RelativeTime
            date={indexed_at}
            className="text-muted-foreground text-xs ml-auto"
          />
        </div>

        {/* Content preview */}
        {(reason === "reply" || reason === "mention" || reason === "quote") &&
          previewText && (
            <p className="text-sm text-foreground/80 line-clamp-2">{previewText}</p>
          )}
      </div>
    </div>
  );
}

export function NotificationList({
  notifications,
}: {
  notifications: NotificationInfo[];
}) {
  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>No notifications yet</p>
      </div>
    );
  }

  return (
    <div>
      {notifications.map((notif) => (
        <NotificationItem key={notif.uri + notif.reason} notification={notif} />
      ))}
    </div>
  );
}
