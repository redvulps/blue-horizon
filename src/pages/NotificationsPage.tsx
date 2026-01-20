import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationList } from "@/components/notification/NotificationList";
import {
  getNotifications,
  markNotificationsRead,
  type NotificationsResponse,
} from "@/lib/notifications";

function NotificationsSkeleton() {
  return (
    <div className="divide-y">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3 p-4">
          <Skeleton className="h-6 w-6 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<NotificationsResponse>("notifications_updated", (event) => {
      queryClient.setQueryData(["notifications"], event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.error("Failed to listen for notifications refresh:", error);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [queryClient]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    staleTime: 1000 * 60, // 1 minute
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });
  const { mutate: markAllRead } = markReadMutation;

  // Mark as read when page loads (optional, or on button click)
  useEffect(() => {
    if (data?.notifications.some((n) => !n.is_read)) {
      markAllRead();
    }
  }, [data, markAllRead]);

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto border-x min-h-screen">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Notifications</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllRead()}
            disabled={markReadMutation.isPending}
          >
            Mark all read
          </Button>
        </header>

        {isLoading ? (
          <NotificationsSkeleton />
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-500 mb-2">Failed to load notifications</p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <NotificationList notifications={data?.notifications || []} />
        )}
      </div>
    </div>
  );
}
