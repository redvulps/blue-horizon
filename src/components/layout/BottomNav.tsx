import { NavLink } from "react-router-dom";
import { Home, Bell, Search, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Search", icon: Search, path: "/feeds" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Chat", icon: Mail, path: "/chat" },
  { label: "Profile", icon: User, path: "/profile" },
];

export function BottomNav() {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background flex justify-around items-center h-16 px-2 pb-safe z-50">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground transition-colors hover:text-foreground",
              isActive && "text-primary",
            )
          }
        >
          <item.icon className="size-6" />
        </NavLink>
      ))}
    </div>
  );
}
