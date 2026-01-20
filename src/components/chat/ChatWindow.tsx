import { useState, useRef, useEffect } from "react";
import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ConversationsResponse,
  type MessageInfo,
  type MessagesResponse,
  sendMessage,
  type ConversationMember,
} from "@/lib/chat";
import { UserAvatar } from "@/components/user/UserAvatar";
import { ChatMessage } from "@/components/chat/ChatMessage";

interface ChatWindowProps {
  convoId: string;
  messages: MessageInfo[];
  members: ConversationMember[];
  currentUserDid?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export function ChatWindow({
  convoId,
  messages,
  members,
  currentUserDid,
  onLoadMore,
  hasMore,
  isLoadingMore = false,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const patchMessagesWithOptimistic = (
    current: InfiniteData<MessagesResponse> | undefined,
    optimistic: MessageInfo,
  ): InfiniteData<MessagesResponse> => {
    if (!current || current.pages.length === 0) {
      return {
        pages: [{ messages: [optimistic], cursor: null }],
        pageParams: [undefined],
      };
    }

    const [firstPage, ...restPages] = current.pages;
    return {
      ...current,
      pages: [
        {
          ...firstPage,
          messages: [optimistic, ...firstPage.messages],
        },
        ...restPages,
      ],
    };
  };

  const replaceMessageById = (
    current: InfiniteData<MessagesResponse> | undefined,
    optimisticId: string,
    nextMessage: MessageInfo,
  ): InfiniteData<MessagesResponse> | undefined => {
    if (!current) return current;

    let replaced = false;
    const pages = current.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) => {
        if (message.id !== optimisticId) return message;
        replaced = true;
        return nextMessage;
      }),
    }));

    if (replaced) {
      return { ...current, pages };
    }

    if (pages.length === 0) {
      return {
        pages: [{ messages: [nextMessage], cursor: null }],
        pageParams: [undefined],
      };
    }

    const [firstPage, ...restPages] = pages;
    return {
      ...current,
      pages: [
        {
          ...firstPage,
          messages: [nextMessage, ...firstPage.messages],
        },
        ...restPages,
      ],
    };
  };

  const patchConversationLastMessage = (
    current: ConversationsResponse | undefined,
    nextMessage: MessageInfo,
  ): ConversationsResponse | undefined => {
    if (!current) return current;

    const targetIndex = current.conversations.findIndex(
      (conversation) => conversation.id === convoId,
    );
    if (targetIndex === -1) return current;

    const targetConversation = current.conversations[targetIndex];
    const updatedConversation = {
      ...targetConversation,
      last_message: nextMessage,
      unread_count: 0,
    };

    const nextConversations = [...current.conversations];
    nextConversations.splice(targetIndex, 1);
    nextConversations.unshift(updatedConversation);

    return {
      ...current,
      conversations: nextConversations,
    };
  };

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMessage(convoId, text),
    onMutate: async (text: string) => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMessage: MessageInfo = {
        id: optimisticId,
        rev: optimisticId,
        sender_did: currentUserDid || "did:unknown:self",
        text,
        sent_at: new Date().toISOString(),
      };

      await queryClient.cancelQueries({ queryKey: ["messages", convoId] });
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      const previousMessages = queryClient.getQueryData<InfiniteData<MessagesResponse>>([
        "messages",
        convoId,
      ]);
      const previousConversations = queryClient.getQueryData<ConversationsResponse>([
        "conversations",
      ]);

      queryClient.setQueryData<InfiniteData<MessagesResponse>>(
        ["messages", convoId],
        (current) => patchMessagesWithOptimistic(current, optimisticMessage),
      );
      queryClient.setQueryData<ConversationsResponse>(["conversations"], (current) =>
        patchConversationLastMessage(current, optimisticMessage),
      );

      return {
        optimisticId,
        previousMessages,
        previousConversations,
      };
    },
    onError: (_error, _text, context) => {
      if (!context) return;

      queryClient.setQueryData(["messages", convoId], context.previousMessages);
      queryClient.setQueryData(["conversations"], context.previousConversations);
    },
    onSuccess: (serverMessage, _text, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<InfiniteData<MessagesResponse>>(
          ["messages", convoId],
          (current) => replaceMessageById(current, context.optimisticId, serverMessage),
        );
      }

      queryClient.setQueryData<ConversationsResponse>(["conversations"], (current) =>
        patchConversationLastMessage(current, serverMessage),
      );
      setInputValue("");
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMutation.mutate(inputValue.trim());
  };

  const getMemberByDid = (did: string) => members.find((m) => m.did === did);

  // Find the other participant(s) - exclude current user
  const otherMembers = members.filter((m) => m.did !== currentUserDid);
  const displayMember = otherMembers[0] || members[0];

  const displayName =
    otherMembers.length > 1
      ? `${displayMember?.display_name || displayMember?.handle} +${otherMembers.length - 1}`
      : displayMember?.display_name || displayMember?.handle || "Unknown";

  // Messages come newest-first from API, reverse for display
  const displayMessages = [...messages].reverse();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <UserAvatar src={displayMember?.avatar} alt={displayName} size="md" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{displayName}</h2>
          {displayMember?.handle && (
            <p className="text-sm text-muted-foreground truncate">
              @{displayMember.handle}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {hasMore && (
          <div className="text-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load earlier messages"}
            </Button>
          </div>
        )}
        {displayMessages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isOwn={msg.sender_did === currentUserDid}
            sender={getMemberByDid(msg.sender_did)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          disabled={sendMutation.isPending}
          className="flex-1"
        />
        <Button type="submit" disabled={!inputValue.trim() || sendMutation.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}
