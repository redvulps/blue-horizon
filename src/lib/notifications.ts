import { invoke } from "@tauri-apps/api/core";

export interface NotificationAuthor {
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
}

export type NotificationRecord =
  | { type: "Like" }
  | { type: "Repost" }
  | { type: "Follow" }
  | { type: "Post"; text: string }
  | { type: "Reply"; text: string }
  | { type: "Quote"; text: string }
  | { type: "Unknown" };

export interface NotificationInfo {
  uri: string;
  cid: string;
  author: NotificationAuthor;
  reason: "like" | "repost" | "follow" | "reply" | "quote" | "mention" | "unknown";
  reason_subject: string | null;
  is_read: boolean;
  indexed_at: string;
  record: NotificationRecord | null;
}

export interface NotificationsResponse {
  notifications: NotificationInfo[];
  cursor: string | null;
}

export async function getNotifications(
  cursor?: string,
  limit: number = 25,
): Promise<NotificationsResponse> {
  return invoke<NotificationsResponse>("get_notifications", { cursor, limit });
}

export async function getUnreadCount(): Promise<number> {
  return invoke<number>("get_unread_count");
}

export async function markNotificationsRead(): Promise<void> {
  return invoke<void>("mark_notifications_read");
}
