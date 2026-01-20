import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListFeedItem,
  ListFeedSkeleton,
  ListHeaderSkeleton,
  ListMemberItem,
  MembersSkeleton,
} from "@/components/list/ListDetailComponents";
import { getList, getListFeed, removeListMember, type ListMember } from "@/lib/feeds";
import { FileText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "members" | "feed";

export default function ListDetailPage() {
  const { listUri } = useParams<{ listUri: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("members");
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const decodedUri = listUri ? decodeURIComponent(listUri) : "";

  const {
    data: listData,
    isLoading: isLoadingList,
    error: listError,
  } = useQuery({
    queryKey: ["list-detail", decodedUri],
    queryFn: () => getList(decodedUri),
    enabled: !!decodedUri,
  });

  const handleRemoveMember = async (member: ListMember) => {
    setRemovingMember(member.did);
    try {
      await removeListMember(member.uri);
      queryClient.invalidateQueries({ queryKey: ["list-detail", decodedUri] });
    } catch (error) {
      console.error("Failed to remove member:", error);
    } finally {
      setRemovingMember(null);
    }
  };

  const {
    data: feedData,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: ["list-feed", decodedUri],
    queryFn: () => getListFeed(decodedUri),
    enabled: !!decodedUri && activeTab === "feed",
  });

  const list = listData?.list;
  const members = listData?.members ?? [];
  const posts = feedData?.posts ?? [];

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
          <h1 className="text-xl font-bold truncate">{list?.name ?? "List"}</h1>
        </header>

        {isLoadingList ? (
          <ListHeaderSkeleton />
        ) : listError ? (
          <div className="p-4 text-center text-red-500">Failed to load list</div>
        ) : list ? (
          <>
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center gap-3">
                {list.avatar ? (
                  <img
                    src={list.avatar}
                    alt={list.name}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold truncate">{list.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    by{" "}
                    <Link
                      to={`/profile/${list.creator_handle}`}
                      className="hover:underline"
                    >
                      @{list.creator_handle}
                    </Link>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {list.member_count} member{list.member_count !== 1 ? "s" : ""} •{" "}
                    {list.purpose.includes("modlist") ? "Moderation" : "Curation"}
                  </p>
                </div>
              </div>
              {list.description && (
                <p className="text-sm text-muted-foreground">{list.description}</p>
              )}
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("members")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                  activeTab === "members"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="h-4 w-4" />
                Members
              </button>
              <button
                onClick={() => setActiveTab("feed")}
                className={cn(
                  "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                  activeTab === "feed"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="h-4 w-4" />
                Feed
              </button>
            </div>

            {activeTab === "members" ? (
              isLoadingList ? (
                <MembersSkeleton />
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No members in this list yet
                </div>
              ) : (
                <div className="divide-y">
                  {members.map((member) => (
                    <ListMemberItem
                      key={member.did}
                      member={member}
                      onRemove={handleRemoveMember}
                      isRemoving={removingMember === member.did}
                    />
                  ))}
                </div>
              )
            ) : isLoadingFeed ? (
              <ListFeedSkeleton />
            ) : feedError ? (
              <div className="p-8 text-center text-red-500">Failed to load feed</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No posts from list members yet
              </div>
            ) : (
              <div className="divide-y">
                {posts.map((post) => (
                  <ListFeedItem key={post.uri} post={post} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
