import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  parseSearchQuery,
  search,
  searchActors,
  searchPosts,
  type SearchResults,
} from "@/lib/search";

type SearchTab = "posts" | "people";

interface UseSearchResultsOptions {
  query: string;
  tab: SearchTab;
  limit?: number;
  enabled?: boolean;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function useSearchResults({
  query,
  tab,
  limit = 25,
  enabled = true,
}: UseSearchResultsOptions) {
  const normalizedQuery = query.trim();

  return useQuery<SearchResults>({
    queryKey: ["search", tab, normalizedQuery, limit],
    enabled: enabled && normalizedQuery.length > 0,
    queryFn: async () => {
      const { author, searchText } = parseSearchQuery(normalizedQuery);

      if (tab === "people") {
        return searchActors(searchText || normalizedQuery, limit);
      }

      return searchPosts(
        searchText || (author ? "*" : normalizedQuery),
        limit,
        undefined,
        "latest",
        author ?? undefined,
      );
    },
  });
}

interface UseQuickSearchResultsOptions {
  query: string;
  enabled?: boolean;
  debounceMs?: number;
}

export function useQuickSearchResults({
  query,
  enabled = true,
  debounceMs = 300,
}: UseQuickSearchResultsOptions) {
  const normalizedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, debounceMs);

  return useQuery<SearchResults>({
    queryKey: ["quick-search", debouncedQuery],
    enabled: enabled && debouncedQuery.length > 0,
    queryFn: () => search(debouncedQuery),
  });
}
