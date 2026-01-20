import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatList } from "@/components/chat/ChatList";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { getConversations, getMessages, getConvo, updateRead } from "@/lib/chat";
import { getSession } from "@/lib/auth";
import {
  CHAT_CONVERSATIONS_POLL_INTERVAL,
  CHAT_CONVERSATIONS_STALE_TIME,
  CHAT_MESSAGES_POLL_INTERVAL,
  CHAT_MESSAGES_STALE_TIME,
  CHAT_CONVO_DETAILS_STALE_TIME,
} from "@/constants";

function ChatSkeleton() {
  return (
    <div className="divide-y">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const [currentUserDid, setCurrentUserDid] = useState<string | null>(null);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const lastReadMessageIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    async function getCurrentUser() {
      try {
        const session = await getSession();
        if (session) {
          setCurrentUserDid(session.did);
        }
      } catch {
        // No session
      }
    }
    getCurrentUser();
  }, []);

  // Handle conversation from URL parameter
  useEffect(() => {
    const convoId = searchParams.get("convo");
    if (convoId && convoId !== selectedConvoId) {
      setSelectedConvoId(convoId);
    }
  }, [searchParams, selectedConvoId]);

  const {
    data: convoData,
    isLoading: convoLoading,
    error: convoError,
    refetch: refetchConvos,
  } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => getConversations(),
    staleTime: CHAT_CONVERSATIONS_STALE_TIME,
    refetchInterval: CHAT_CONVERSATIONS_POLL_INTERVAL,
  });

  const selectedConvo = convoData?.conversations.find((c) => c.id === selectedConvoId);

  // Fetch specific conversation details to get full member info
  const { data: selectedConvoDetails, isLoading: convoDetailsLoading } = useQuery({
    queryKey: ["convo", selectedConvoId],
    queryFn: () => getConvo(selectedConvoId!),
    enabled: !!selectedConvoId,
    staleTime: CHAT_CONVO_DETAILS_STALE_TIME,
  });

  const convoToShow = selectedConvoDetails || selectedConvo;

  const {
    data: messagesData,
    fetchNextPage: fetchNextMessagesPage,
    hasNextPage: hasNextMessagesPage,
    isFetchingNextPage: isFetchingNextMessagesPage,
  } = useInfiniteQuery({
    queryKey: ["messages", selectedConvoId],
    queryFn: ({ pageParam }) => getMessages(selectedConvoId!, pageParam),
    enabled: !!selectedConvoId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    staleTime: CHAT_MESSAGES_STALE_TIME,
    refetchInterval: CHAT_MESSAGES_POLL_INTERVAL,
  });
  const allMessages = useMemo(() => {
    const mergedMessages = messagesData?.pages.flatMap((page) => page.messages) ?? [];
    const seenMessageIds = new Set<string>();
    return mergedMessages.filter((message) => {
      if (seenMessageIds.has(message.id)) {
        return false;
      }
      seenMessageIds.add(message.id);
      return true;
    });
  }, [messagesData]);

  useEffect(() => {
    lastReadMessageIdRef.current = null;
  }, [selectedConvoId]);

  // Mark conversation as read when messages are loaded
  useEffect(() => {
    async function markAsRead() {
      if (!selectedConvoId || allMessages.length === 0) return;

      // Get the most recent message ID (first in the array, since messages come newest-first)
      const latestMessage = allMessages[0];
      if (!latestMessage) return;
      if (lastReadMessageIdRef.current === latestMessage.id) return;

      try {
        await updateRead(selectedConvoId, latestMessage.id);
        lastReadMessageIdRef.current = latestMessage.id;
        // Invalidate queries to refresh unread counts
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["chatUnreadCount"] });
      } catch (err) {
        console.error("Failed to mark conversation as read:", err);
      }
    }
    markAsRead();
  }, [selectedConvoId, allMessages, queryClient]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-full md:w-80 border-r overflow-y-auto">
          {convoLoading ? (
            <ChatSkeleton />
          ) : convoError ? (
            <div className="p-4 text-center">
              <p className="text-red-500 mb-2">Failed to load</p>
              <Button size="sm" onClick={() => refetchConvos()}>
                Retry
              </Button>
            </div>
          ) : (
            <ChatList
              conversations={convoData?.conversations || []}
              currentUserDid={currentUserDid || undefined}
              selectedId={selectedConvoId || undefined}
              onSelectConversation={setSelectedConvoId}
            />
          )}
        </div>

        {/* Message view */}
        <div className="hidden md:flex flex-1 flex-col h-full overflow-hidden">
          {!selectedConvoId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Select a conversation</p>
            </div>
          ) : convoDetailsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="h-8 w-32" />
            </div>
          ) : (
            <ChatWindow
              convoId={selectedConvoId}
              messages={allMessages}
              members={convoToShow?.members || []}
              currentUserDid={currentUserDid || undefined}
              hasMore={hasNextMessagesPage}
              isLoadingMore={isFetchingNextMessagesPage}
              onLoadMore={() => fetchNextMessagesPage()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
