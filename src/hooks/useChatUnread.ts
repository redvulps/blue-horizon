import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChatUnreadCount } from "@/lib/chat";
import { useUIStore, selectSetChatUnreadCount } from "@/stores/uiStore";

import {
  CHAT_UNREAD_COUNT_POLL_INTERVAL,
  CHAT_UNREAD_COUNT_STALE_TIME,
} from "@/constants";

export function useChatUnreadPolling() {
  const setChatUnreadCount = useUIStore(selectSetChatUnreadCount);

  const { data } = useQuery({
    queryKey: ["chatUnreadCount"],
    queryFn: getChatUnreadCount,
    enabled: true,
    refetchInterval: CHAT_UNREAD_COUNT_POLL_INTERVAL,
    staleTime: CHAT_UNREAD_COUNT_STALE_TIME,
  });

  useEffect(() => {
    if (data?.count !== undefined) {
      setChatUnreadCount(data.count);
    }
  }, [data?.count, setChatUnreadCount]);

  return data?.count ?? 0;
}
