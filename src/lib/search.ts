import { invoke } from "@tauri-apps/api/core";

export interface SearchResultAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

export interface SearchResultPost {
  uri: string;
  cid: string;
  author: SearchResultAuthor;
  text: string;
  indexedAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
}

export interface SearchResults {
  actors: SearchResultAuthor[];
  posts: SearchResultPost[];
  cursor?: string;
}

export interface ParsedSearchQuery {
  author: string | null;
  searchText: string;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const fromMatch = query.trim().match(/^from:(\S+)\s*(.*)?$/);
  if (fromMatch) {
    return {
      author: fromMatch[1],
      searchText: fromMatch[2]?.trim() || "",
    };
  }

  return {
    author: null,
    searchText: query.trim(),
  };
}

export function buildSearchQuery(searchText: string, author?: string | null): string {
  const normalizedText = searchText.trim();
  const normalizedAuthor = author?.trim() || null;

  if (!normalizedAuthor) return normalizedText;
  return `from:${normalizedAuthor} ${normalizedText}`.trim();
}

/** Quick search for both actors and posts */
export async function search(query: string): Promise<SearchResults> {
  return await invoke("search", { query });
}

/** Search for actors (users) */
export async function searchActors(
  query: string,
  limit?: number,
  cursor?: string,
): Promise<SearchResults> {
  return await invoke("search_actors", { query, limit, cursor });
}

/** Search for posts */
export async function searchPosts(
  query: string,
  limit?: number,
  cursor?: string,
  sort?: "top" | "latest",
  author?: string,
): Promise<SearchResults> {
  return await invoke("search_posts", { query, limit, cursor, sort, author });
}
