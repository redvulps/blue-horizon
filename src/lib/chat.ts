import { invoke } from "@tauri-apps/api/core";

export interface ConversationMember {
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
}

export interface MessageInfo {
  id: string;
  rev: string;
  sender_did: string;
  text: string;
  sent_at: string;
}

export interface ConversationInfo {
  id: string;
  rev: string;
  members: ConversationMember[];
  last_message: MessageInfo | null;
  unread_count: number;
  muted: boolean;
}

export interface ConversationsResponse {
  conversations: ConversationInfo[];
  cursor: string | null;
}

export interface MessagesResponse {
  messages: MessageInfo[];
  cursor: string | null;
}

export async function getConversations(cursor?: string): Promise<ConversationsResponse> {
  return invoke<ConversationsResponse>("get_conversations", { cursor });
}

export async function getMessages(
  convoId: string,
  cursor?: string,
): Promise<MessagesResponse> {
  return invoke<MessagesResponse>("get_messages", {
    request: { convo_id: convoId, cursor },
  });
}

export async function sendMessage(convoId: string, text: string): Promise<MessageInfo> {
  return invoke<MessageInfo>("send_message", {
    request: { convo_id: convoId, text },
  });
}

export async function getConvoForMembers(members: string[]): Promise<ConversationInfo> {
  return invoke<ConversationInfo>("get_convo_for_members", {
    request: { members },
  });
}

export async function getConvo(convoId: string): Promise<ConversationInfo> {
  return invoke<ConversationInfo>("get_convo", {
    request: { convo_id: convoId },
  });
}

export interface UpdateReadResponse {
  convo_id: string;
  unread_count: number;
}

export async function updateRead(
  convoId: string,
  messageId: string,
): Promise<UpdateReadResponse> {
  return invoke<UpdateReadResponse>("update_read", {
    request: { convo_id: convoId, message_id: messageId },
  });
}

export interface ChatUnreadCountResponse {
  count: number;
}

export async function getChatUnreadCount(): Promise<ChatUnreadCountResponse> {
  return invoke<ChatUnreadCountResponse>("get_chat_unread_count");
}
