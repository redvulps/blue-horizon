import { invoke } from "@tauri-apps/api/core";

import type { TimelinePost } from "./api";

// Feed types
export interface FeedInfo {
  uri: string;
  cid: string;
  did: string;
  creator_did: string;
  creator_handle: string;
  creator_display_name: string | null;
  creator_avatar: string | null;
  display_name: string;
  description: string | null;
  avatar: string | null;
  like_count: number;
  is_saved: boolean;
}

export interface SuggestedFeedsResponse {
  feeds: FeedInfo[];
  cursor: string | null;
}

export interface FeedPostsResponse {
  posts: TimelinePost[];
  cursor: string | null;
}

// List types
export interface ListInfo {
  uri: string;
  cid: string;
  name: string;
  purpose: string;
  description: string | null;
  avatar: string | null;
  creator_did: string;
  creator_handle: string;
  creator_display_name: string | null;
  creator_avatar: string | null;
  member_count: number;
}

export interface ListMember {
  uri: string;
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
}

export interface ActorListsResponse {
  lists: ListInfo[];
  cursor: string | null;
}

export interface ListDetailsResponse {
  list: ListInfo;
  members: ListMember[];
  cursor: string | null;
}

// Re-export from api.ts
export type { TimelinePost, TimelineResponse, ProfileResponse } from "./api";

// Feed functions
export async function getSuggestedFeeds(
  cursor?: string,
): Promise<SuggestedFeedsResponse> {
  return invoke<SuggestedFeedsResponse>("get_suggested_feeds", { cursor });
}

export async function getFeed(
  feedUri: string,
  limit?: number,
  cursor?: string,
): Promise<FeedPostsResponse> {
  return invoke<FeedPostsResponse>("get_feed", {
    request: { feed_uri: feedUri, limit, cursor },
  });
}

// List functions
export async function getActorLists(
  actor: string,
  cursor?: string,
): Promise<ActorListsResponse> {
  return invoke<ActorListsResponse>("get_actor_lists", { actor, cursor });
}

export async function getList(
  listUri: string,
  cursor?: string,
): Promise<ListDetailsResponse> {
  return invoke<ListDetailsResponse>("get_list", {
    request: { list_uri: listUri, cursor },
  });
}

// List membership check
export interface ListMembership {
  list_uri: string;
  listitem_uri: string;
}

export interface SubjectMembershipsResponse {
  memberships: ListMembership[];
}

export async function getSubjectListMemberships(
  subjectDid: string,
): Promise<SubjectMembershipsResponse> {
  return invoke<SubjectMembershipsResponse>("get_subject_list_memberships", {
    subjectDid,
  });
}

// List CRUD functions
export interface CreateListRequest {
  name: string;
  purpose: "curatelist" | "modlist";
  description?: string;
}

export interface CreateListResponse {
  uri: string;
  cid: string;
}

export async function createList(
  request: CreateListRequest,
): Promise<CreateListResponse> {
  return invoke<CreateListResponse>("create_list", { request });
}

export interface UpdateListRequest {
  list_uri: string;
  name: string;
  description?: string;
}

export async function updateList(request: UpdateListRequest): Promise<void> {
  return invoke<void>("update_list", { request });
}

export async function deleteList(listUri: string): Promise<void> {
  return invoke<void>("delete_list", { listUri });
}

// List member functions
export interface AddListMemberResponse {
  uri: string;
}

export async function addListMember(
  listUri: string,
  subjectDid: string,
): Promise<AddListMemberResponse> {
  return invoke<AddListMemberResponse>("add_list_member", {
    request: { list_uri: listUri, subject_did: subjectDid },
  });
}

export async function removeListMember(listitemUri: string): Promise<void> {
  return invoke<void>("remove_list_member", { listitemUri });
}

// List feed
export interface ListFeedPost {
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
  viewer_like: string | null;
  viewer_repost: string | null;
}

export interface ListFeedResponse {
  posts: ListFeedPost[];
  cursor: string | null;
}

export async function getListFeed(
  listUri: string,
  limit: number = 50,
  cursor?: string,
): Promise<ListFeedResponse> {
  return invoke<ListFeedResponse>("get_list_feed", {
    request: { list_uri: listUri, limit, cursor },
  });
}
