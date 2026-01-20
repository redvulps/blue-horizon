import { useEffect } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  getTimeline,
  getProfile,
  getAuthorFeed,
  type TimelineResponse,
  type ProfileResponse,
} from "@/lib/api";
import { TIMELINE_STALE_TIME, PROFILE_STALE_TIME } from "@/constants";

interface ProfileUpdatedEvent {
  handle: string;
  profile: ProfileResponse;
}

/**
 * Hook for cursor-based home timeline pagination
 */
export function useTimelineInfinite() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<TimelineResponse>("timeline_updated", (event) => {
      queryClient.setQueryData<InfiniteData<TimelineResponse>>(
        ["timeline-infinite"],
        (current) => {
          if (!current) {
            return {
              pages: [event.payload],
              pageParams: [undefined],
            };
          }

          if (current.pages.length === 0) {
            return {
              ...current,
              pages: [event.payload],
            };
          }

          return {
            ...current,
            pages: [event.payload, ...current.pages.slice(1)],
          };
        },
      );
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.error("Failed to listen for timeline updates:", error);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ["timeline-infinite"],
    queryFn: ({ pageParam }) => getTimeline(50, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    staleTime: TIMELINE_STALE_TIME,
  });
}

/**
 * Hook for fetching user profile
 */
export function useProfile(handle: string) {
  const queryClient = useQueryClient();
  const normalizedHandle = handle.trim().toLowerCase();

  useEffect(() => {
    if (!normalizedHandle) return;

    let unlisten: (() => void) | undefined;
    void listen<ProfileUpdatedEvent>("profile_updated", (event) => {
      if (event.payload.handle.toLowerCase() !== normalizedHandle) return;
      queryClient.setQueryData(["profile", handle], event.payload.profile);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.error("Failed to listen for profile updates:", error);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [normalizedHandle, handle, queryClient]);

  return useQuery<ProfileResponse>({
    queryKey: ["profile", handle],
    queryFn: () => getProfile(handle),
    enabled: !!handle,
    staleTime: PROFILE_STALE_TIME,
  });
}

/**
 * Hook for fetching author's posts feed
 */
export function useAuthorFeed(
  handle: string,
  cursor?: string,
  filter?: string,
  enabled: boolean = true,
) {
  return useQuery<TimelineResponse>({
    queryKey: ["author_feed", handle, cursor ?? null, filter ?? null],
    queryFn: () => getAuthorFeed(handle, 50, cursor, filter),
    enabled: !!handle && enabled,
    staleTime: TIMELINE_STALE_TIME,
  });
}
