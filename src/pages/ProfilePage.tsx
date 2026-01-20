import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/feedback/Modal";
import { UserAvatar } from "@/components/user/UserAvatar";
import { UserBadge } from "@/components/user/UserBadge";
import { UserStats } from "@/components/user/UserStats";
import { ProfileActionsDropdown } from "@/components/user/ProfileActionsDropdown";
import { AuthorPostItem } from "@/components/post/AuthorPostItem";
import { AddToListModal } from "@/components/list/AddToListModal";
import { CreateListModal } from "@/components/list/CreateListModal";
import { Loader2 } from "lucide-react";

import { useProfile, useAuthorFeed } from "@/hooks/useBluesky";
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollows,
  type FollowListItem,
} from "@/lib/api";
import { useAuthStore, selectIsAuthenticated, selectSession } from "@/stores/authStore";
import { getConvoForMembers } from "@/lib/chat";

type FollowListType = "followers" | "following";

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="flex gap-4 items-start">
        <Skeleton className="h-20 w-20 rounded-full -mt-10 border-4 border-background" />
        <div className="flex-1 space-y-2 pt-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex gap-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const session = useAuthStore(selectSession);
  const [activeTab, setActiveTab] = useState<"posts" | "replies" | "likes">("posts");
  const [isMessaging, setIsMessaging] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [followUri, setFollowUri] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockingUri, setBlockingUri] = useState<string | null>(null);
  const [addToListModalOpen, setAddToListModalOpen] = useState(false);
  const [createListModalOpen, setCreateListModalOpen] = useState(false);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListType, setFollowListType] = useState<FollowListType>("followers");

  const currentHandle = handle || session?.handle || null;

  const { data: profile, isLoading, error, refetch } = useProfile(currentHandle || "");

  useEffect(() => {
    if (!profile) return;
    setIsFollowing(profile.is_following);
    setFollowUri(profile.viewer_following);
    setIsMuted(profile.viewer_muted);
    setIsBlocked(!!profile.viewer_blocking);
    setBlockingUri(profile.viewer_blocking);
  }, [profile]);

  const handleStartConversation = async () => {
    if (!profile?.did || !session?.did) return;

    setIsMessaging(true);
    try {
      const conversation = await getConvoForMembers([profile.did]);
      navigate(`/chat?convo=${conversation.id}`);
    } catch (error) {
      console.error("Failed to start conversation:", error);
    } finally {
      setIsMessaging(false);
    }
  };

  const handleFollow = async () => {
    if (!profile?.did) return;

    setIsUpdatingFollow(true);
    try {
      const uri = await followUser(profile.did);
      setIsFollowing(true);
      setFollowUri(uri);
      refetch();
    } catch (error) {
      console.error("Failed to follow user:", error);
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  const handleUnfollow = async () => {
    if (!followUri) return;

    setIsUpdatingFollow(true);
    try {
      await unfollowUser(followUri);
      setIsFollowing(false);
      setFollowUri(null);
      refetch();
    } catch (error) {
      console.error("Failed to unfollow user:", error);
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  // Check if viewing own profile
  const isOwnProfile = profile?.did === session?.did;

  useEffect(() => {
    if (!profile) return;
    if (activeTab === "likes" && !isOwnProfile) {
      setActiveTab("posts");
    }
  }, [activeTab, isOwnProfile, profile]);

  // Get author feed based on active tab
  const filter =
    activeTab === "replies" ? "replies" : activeTab === "likes" ? "likes" : "posts";
  const canLoadLikes = activeTab !== "likes" || isOwnProfile;
  const authorFeedActor = (profile?.did || profile?.handle || currentHandle || "")
    .replace(/^@/, "")
    .trim();
  const {
    data: feedData,
    isLoading: isFeedLoading,
    error: feedError,
    refetch: refetchFeed,
  } = useAuthorFeed(authorFeedActor, undefined, filter, canLoadLikes);
  const followListActor = profile?.did ?? "";

  const {
    data: followListData,
    isLoading: isFollowListLoading,
    error: followListError,
    hasNextPage: hasNextFollowListPage,
    isFetchingNextPage: isFetchingNextFollowListPage,
    fetchNextPage: fetchNextFollowListPage,
    refetch: refetchFollowList,
  } = useInfiniteQuery({
    queryKey: ["profile-follow-list", followListActor, followListType],
    queryFn: ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : undefined;
      return followListType === "followers"
        ? getFollowers(followListActor, 50, cursor)
        : getFollows(followListActor, 50, cursor);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: followListOpen && !!followListActor,
    staleTime: 1000 * 60,
  });

  const followListItems: FollowListItem[] =
    followListData?.pages.flatMap((page) => page.items) ?? [];
  const followListErrorMessage =
    followListError instanceof Error ? followListError.message : "Failed to load users";

  const openFollowList = (type: FollowListType) => {
    setFollowListType(type);
    setFollowListOpen(true);
  };

  // No handle to display
  if (!currentHandle && !isLoading) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-muted-foreground mb-4">
            {isAuthenticated ? "Unable to load profile" : "Sign in to view your profile"}
          </p>
          <Button asChild>
            <Link to={isAuthenticated ? "/" : "/welcome"}>
              {isAuthenticated ? "Go Home" : "Sign In"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-red-500 mb-4">Failed to load profile</p>
          <p className="text-muted-foreground text-sm mb-4">{error.message}</p>
          <Button asChild variant="ghost">
            <Link to="/">← Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-muted-foreground">Profile not found</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/">← Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Banner */}
        {profile.banner ? (
          <img src={profile.banner} alt="Banner" className="h-32 w-full object-cover" />
        ) : (
          <div className="h-32 w-full bg-gradient-to-r from-blue-500 to-purple-500" />
        )}

        {/* Profile Info */}
        <div className="px-4 pb-4">
          <div className="flex items-end gap-4 -mt-10">
            <UserAvatar
              src={profile.avatar}
              alt={profile.display_name || profile.handle}
              size="xl"
              className="border-4 border-background"
            />
            <div className="flex-1 pb-2 flex items-center justify-between">
              <div>
                {profile.is_followed_by && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    Follows you
                  </span>
                )}
              </div>
              {!isOwnProfile && (
                <div className="flex gap-2">
                  <Button
                    onClick={isFollowing ? handleUnfollow : handleFollow}
                    disabled={isUpdatingFollow || isBlocked}
                    variant={isFollowing ? "outline" : "default"}
                    size="sm"
                  >
                    {isUpdatingFollow
                      ? "Updating..."
                      : isFollowing
                        ? "Unfollow"
                        : "Follow"}
                  </Button>
                  <Button
                    onClick={handleStartConversation}
                    disabled={isMessaging || isBlocked}
                    variant="outline"
                    size="sm"
                  >
                    {isMessaging ? "Opening..." : "Message"}
                  </Button>
                  <ProfileActionsDropdown
                    handle={profile.handle}
                    did={profile.did}
                    isMuted={isMuted}
                    isBlocked={isBlocked}
                    blockingUri={blockingUri}
                    onMuteChange={setIsMuted}
                    onBlockChange={(blocked, uri) => {
                      setIsBlocked(blocked);
                      setBlockingUri(uri);
                    }}
                    onAddToList={() => setAddToListModalOpen(true)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            <UserBadge
              displayName={profile.display_name}
              handle={profile.handle}
              layout="vertical"
              truncate={false}
            />
          </div>

          {profile.description && (
            <p className="mt-3 text-sm whitespace-pre-wrap">{profile.description}</p>
          )}

          <UserStats
            followersCount={profile.followers_count}
            followsCount={profile.follows_count}
            postsCount={profile.posts_count}
            className="mt-4"
            onFollowersClick={() => openFollowList("followers")}
            onFollowingClick={() => openFollowList("following")}
          />
        </div>

        {/* Tabs */}
        <div className="border-t">
          <div className="flex">
            <button
              onClick={() => setActiveTab("posts")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "posts"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Posts
            </button>
            <button
              onClick={() => setActiveTab("replies")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "replies"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Replies
            </button>
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab("likes")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "likes"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Likes
              </button>
            )}
          </div>
        </div>

        {/* Posts Feed */}
        <div className="divide-y">
          {isFeedLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </div>
            ))
          ) : activeTab === "likes" && !isOwnProfile ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Likes are only available on your own profile.</p>
            </div>
          ) : feedError ? (
            <div className="p-8 text-center">
              <p className="text-red-500 mb-2">Failed to load {activeTab}</p>
              <p className="text-muted-foreground text-sm mb-4">{feedError.message}</p>
              <Button variant="outline" onClick={() => refetchFeed()}>
                Retry
              </Button>
            </div>
          ) : feedData?.posts && feedData.posts.length > 0 ? (
            feedData.posts.map((post, index) => (
              <AuthorPostItem key={`${activeTab}-${post.uri}-${index}`} post={post} />
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p>No {activeTab} found</p>
              {activeTab === "posts" && (
                <p className="text-sm mt-2">This user hasn't posted anything yet</p>
              )}
            </div>
          )}
        </div>
      </div>

      {profile && (
        <>
          <Modal
            open={followListOpen}
            onOpenChange={setFollowListOpen}
            title={followListType === "followers" ? "Followers" : "Following"}
            description={`@${profile.handle}`}
            showCloseButton={false}
          >
            <div className="space-y-4 overflow-x-hidden width-full">
              {isFollowListLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : followListError ? (
                <div className="space-y-3 py-2">
                  <p className="text-sm text-destructive">{followListErrorMessage}</p>
                  <Button variant="outline" size="sm" onClick={() => refetchFollowList()}>
                    Retry
                  </Button>
                </div>
              ) : followListItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No users found.</p>
              ) : (
                <div className="max-h-[420px] overflow-y-auto space-y-1.5 pr-1">
                  {followListItems.map((item) => (
                    <Link
                      key={item.did}
                      to={`/profile/${item.did}`}
                      onClick={() => setFollowListOpen(false)}
                      className="flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors hover:bg-muted/40"
                    >
                      <UserAvatar
                        src={item.avatar}
                        alt={item.display_name || item.handle}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate leading-tight">
                            {item.display_name || item.handle}
                          </p>
                          {item.is_followed_by && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              Follows you
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          @{item.handle}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                {hasNextFollowListPage ? (
                  <Button
                    variant="outline"
                    onClick={() => fetchNextFollowListPage()}
                    disabled={isFetchingNextFollowListPage}
                  >
                    {isFetchingNextFollowListPage ? "Loading..." : "Load More"}
                  </Button>
                ) : (
                  <div />
                )}
                <Button variant="outline" onClick={() => setFollowListOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>

          <AddToListModal
            open={addToListModalOpen}
            onOpenChange={setAddToListModalOpen}
            subjectDid={profile.did}
            subjectHandle={profile.handle}
            refreshTrigger={listRefreshTrigger}
            onCreateList={() => {
              setAddToListModalOpen(false);
              setCreateListModalOpen(true);
            }}
          />

          <CreateListModal
            open={createListModalOpen}
            onOpenChange={setCreateListModalOpen}
            onSuccess={() => {
              setCreateListModalOpen(false);
              setListRefreshTrigger((prev) => prev + 1);
              setAddToListModalOpen(true);
            }}
          />
        </>
      )}
    </div>
  );
}
