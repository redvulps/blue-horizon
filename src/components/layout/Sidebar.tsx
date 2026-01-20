import { Link, NavLink, useLocation } from "react-router-dom";
import { Home, Bell, Search, Mail, List, User, Settings, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore, selectSession } from "@/stores/authStore";
import { useProfile } from "@/hooks/useBluesky";
import { useUIStore, selectChatUnreadCount } from "@/stores/uiStore";
import { useChatUnreadPolling } from "@/hooks/useChatUnread";

const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Feeds", icon: Search, path: "/feeds" },
  { label: "Lists", icon: List, path: "/lists" },
  { label: "Chat", icon: Mail, path: "/chat" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Profile", icon: User, path: "/profile" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function Sidebar() {
  const session = useAuthStore(selectSession);
  const { data: profile } = useProfile(session?.handle || "");
  const location = useLocation();
  const openPostModal = useUIStore((state) => state.openPostModal);
  const chatUnreadCount = useUIStore(selectChatUnreadCount);

  // Start polling for chat unread count
  useChatUnreadPolling();

  const displayName = profile?.display_name || session?.handle;
  const handle = session?.handle;
  const avatar = profile?.avatar;

  return (
    <div className="hidden md:flex flex-col w-64 border-r bg-background p-4 h-full overflow-y-auto">
      <nav className="space-y-2">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.path}
            variant={location.pathname === item.path ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start gap-4 text-base font-normal h-12",
              location.pathname === item.path && "font-medium",
            )}
            asChild
          >
            <NavLink to={item.path} state={{ isRootNav: true }}>
              <item.icon className="size-6" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.label === "Chat" && chatUnreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              )}
            </NavLink>
          </Button>
        ))}

        <Button className="w-full mt-4 gap-2" size="lg" onClick={() => openPostModal()}>
          <PenSquare className="size-5" />
          New Post
        </Button>
      </nav>

      {handle && (
        <div className="mt-auto pt-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-auto py-3"
            asChild
          >
            <Link to="/profile" state={{ isRootNav: true }}>
              <div className="size-10 rounded-full bg-muted overflow-hidden shrink-0">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={displayName || handle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                    <User className="size-5" />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start truncate text-left min-w-0 flex-1">
                <span className="font-medium truncate w-full">{displayName}</span>
                <span className="text-xs text-muted-foreground truncate w-full">
                  @{handle}
                </span>
              </div>
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
