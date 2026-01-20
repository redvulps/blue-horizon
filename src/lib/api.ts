import { invoke } from "@tauri-apps/api/core";

import type { Embed } from "@/types/bluesky";

export interface TimelinePost {
  uri: string;
  cid: string;
  author_did: string;
  author_handle: string;
  author_display_name: string | null;
  author_avatar: string | null;
  is_repost: boolean;
  reposted_by_handle: string | null;
  reposted_by_display_name: string | null;
  text: string;
  created_at: string;
  reply_count: number;
  repost_count: number;
  like_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  viewer_like?: string | null;
  viewer_repost?: string | null;
  embed?: Embed | null;
}

export interface TimelineResponse {
  posts: TimelinePost[];
  cursor: string | null;
}

export interface ProfileResponse {
  did: string;
  handle: string;
  display_name: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  followers_count: number;
  follows_count: number;
  posts_count: number;
  is_following: boolean;
  is_followed_by: boolean;
  viewer_following: string | null;
  viewer_muted: boolean;
  viewer_blocking: string | null;
}

export interface FollowListItem {
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
  description: string | null;
  is_following: boolean;
  is_followed_by: boolean;
}

export interface FollowListResponse {
  items: FollowListItem[];
  cursor: string | null;
}

/**
 * Get home timeline
 */
export async function getTimeline(
  limit: number = 50,
  cursor?: string,
): Promise<TimelineResponse> {
  return invoke<TimelineResponse>("get_timeline", {
    request: { limit, cursor },
  });
}

/**
 * Get user profile
 */
export async function getProfile(handle: string): Promise<ProfileResponse> {
  return invoke<ProfileResponse>("get_profile", {
    request: { handle },
  });
}

/**
 * Get account followers
 */
export async function getFollowers(
  actor: string,
  limit: number = 50,
  cursor?: string,
): Promise<FollowListResponse> {
  return invoke<FollowListResponse>("get_followers", {
    request: { actor, limit, cursor },
  });
}

/**
 * Get accounts followed by actor
 */
export async function getFollows(
  actor: string,
  limit: number = 50,
  cursor?: string,
): Promise<FollowListResponse> {
  return invoke<FollowListResponse>("get_follows", {
    request: { actor, limit, cursor },
  });
}

/**
 * Get author's posts feed
 */
export async function getAuthorFeed(
  handle: string,
  limit: number = 50,
  cursor?: string,
  filter?: string,
): Promise<TimelineResponse> {
  return invoke<TimelineResponse>("get_author_feed", {
    request: { handle, limit, cursor, filter },
  });
}

export interface ThreadPost {
  uri: string;
  cid: string;
  author_did: string;
  author_handle: string;
  author_display_name: string | null;
  author_avatar: string | null;
  text: string;
  created_at: string;
  reply_count: number;
  repost_count: number;
  like_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  viewer_like?: string | null;
  viewer_repost?: string | null;
  embed?: Embed | null;
}

export interface ThreadResponse {
  post: ThreadPost;
  parent: ThreadResponse | null;
  replies: ThreadResponse[];
}

export interface ImageInput {
  path: string;
  alt: string;
}

export interface PostDraft {
  text: string;
  reply_to: string | null;
  quote_uri: string | null;
  quote_cid: string | null;
  images: ImageInput[];
  updated_at: string;
}

/**
 * Get post thread with parent chain and replies
 */
export async function getPostThread(
  uri: string,
  depth?: number,
): Promise<ThreadResponse> {
  return invoke<ThreadResponse>("get_post_thread", {
    request: { uri, depth },
  });
}

/** Create post (queued automatically on offline/network failure). */
export async function createPost(input: {
  text: string;
  replyTo?: string;
  quoteUri?: string;
  quoteCid?: string;
  images: ImageInput[];
}): Promise<void> {
  return invoke<void>("create_post", input);
}

/** Save or update composer draft in backend SQLite cache. */
export async function savePostDraft(input: {
  text: string;
  replyTo?: string;
  quoteUri?: string;
  quoteCid?: string;
  images: ImageInput[];
}): Promise<void> {
  return invoke<void>("save_post_draft", input);
}

/** Load draft for a composer context (new/reply/quote). */
export async function getPostDraft(
  replyTo?: string,
  quoteUri?: string,
): Promise<PostDraft | null> {
  return invoke<PostDraft | null>("get_post_draft", { replyTo, quoteUri });
}

/** Clear draft for a composer context (new/reply/quote). */
export async function clearPostDraft(replyTo?: string, quoteUri?: string): Promise<void> {
  return invoke<void>("clear_post_draft", { replyTo, quoteUri });
}

/** Like a post */
export async function likePost(uri: string, cid: string): Promise<void> {
  return invoke<void>("like_post", { uri, cid });
}

/** Unlike a post (requires like record URI) */
export async function unlikePost(likeUri: string): Promise<void> {
  return invoke<void>("unlike_post", { likeUri });
}

/** Repost a post */
export async function repostPost(uri: string, cid: string): Promise<void> {
  return invoke<void>("repost_post", { uri, cid });
}

/** Remove repost (requires repost record URI) */
export async function unrepostPost(repostUri: string): Promise<void> {
  return invoke<void>("unrepost_post", { repostUri });
}

/** Follow a user - returns the follow record URI */
export async function followUser(did: string): Promise<string> {
  return invoke<string>("follow_user", { did });
}

/** Unfollow a user (requires follow record URI) */
export async function unfollowUser(followUri: string): Promise<void> {
  return invoke<void>("unfollow_user", { followUri });
}

/** Mute a user */
export async function muteActor(did: string): Promise<void> {
  return invoke<void>("mute_actor", { did });
}

/** Unmute a user */
export async function unmuteActor(did: string): Promise<void> {
  return invoke<void>("unmute_actor", { did });
}

/** Block a user - returns the block record URI */
export async function blockActor(did: string): Promise<string> {
  return invoke<string>("block_actor", { did });
}

/** Unblock a user (requires block record URI) */
export async function unblockActor(blockUri: string): Promise<void> {
  return invoke<void>("unblock_actor", { blockUri });
}
