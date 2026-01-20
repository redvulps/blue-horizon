import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useSearchResults } from "@/hooks/useSearch";
import { buildSearchQuery, parseSearchQuery } from "@/lib/search";

type SearchTab = "posts" | "people";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SearchTab>("posts");

  useEffect(() => {
    if (!submittedQuery) {
      setQuery("");
      setAuthorFilter(null);
      return;
    }

    const parsed = parseSearchQuery(submittedQuery);
    setQuery(parsed.searchText);
    setAuthorFilter(parsed.author);
    if (parsed.author && activeTab === "people") {
      setActiveTab("posts");
    }
  }, [activeTab, submittedQuery]);

  const {
    data: results,
    isLoading,
    error,
  } = useSearchResults({
    query: submittedQuery,
    tab: activeTab,
    enabled: submittedQuery.trim().length > 0,
  });

  const errorMessage = error instanceof Error ? error.message : "Search failed";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullQuery = buildSearchQuery(query, authorFilter);
    if (!fullQuery) {
      setSearchParams({});
      return;
    }

    setSearchParams({ q: fullQuery });
  };

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 border-b">
          <form onSubmit={handleSubmit} className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={
                  authorFilter
                    ? `Search posts from @${authorFilter}...`
                    : "Search posts or people..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 pr-20"
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                Search
              </Button>
            </div>
          </form>

          {!authorFilter && (
            <div className="flex border-t">
              <button
                onClick={() => handleTabChange("posts")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "posts"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Posts
              </button>
              <button
                onClick={() => handleTabChange("people")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "people"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                People
              </button>
            </div>
          )}
        </div>

        {authorFilter && activeTab === "posts" && (
          <div className="px-4 py-2 bg-muted/50 text-sm text-muted-foreground">
            Showing posts from{" "}
            <span className="font-medium text-foreground">@{authorFilter}</span>
          </div>
        )}

        <div className="divide-y">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </div>
            ))
          ) : error ? (
            <div className="p-8 text-center text-destructive">
              <p>{errorMessage}</p>
            </div>
          ) : !submittedQuery.trim() ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Enter a search query to find posts or people</p>
              <p className="text-sm mt-2">
                Tip: Use <code className="bg-muted px-1 rounded">from:handle</code> to
                search posts from a specific user
              </p>
            </div>
          ) : activeTab === "posts" ? (
            results?.posts && results.posts.length > 0 ? (
              results.posts.map((post) => (
                <Link
                  key={post.uri}
                  to={`/post/${post.uri.replace("at://", "")}`}
                  className="block p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-3">
                    <UserAvatar
                      src={post.author.avatar}
                      alt={post.author.displayName || post.author.handle}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {post.author.displayName || post.author.handle}
                        </span>
                        <span className="text-muted-foreground text-sm truncate">
                          @{post.author.handle}
                        </span>
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                        {post.text}
                      </p>
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span>{post.replyCount} replies</span>
                        <span>{post.repostCount} reposts</span>
                        <span>{post.likeCount} likes</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>No posts found</p>
              </div>
            )
          ) : results?.actors && results.actors.length > 0 ? (
            results.actors.map((actor) => (
              <Link
                key={actor.did}
                to={`/profile/${actor.handle}`}
                className="block p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex gap-3">
                  <UserAvatar
                    src={actor.avatar}
                    alt={actor.displayName || actor.handle}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {actor.displayName || actor.handle}
                    </div>
                    <div className="text-muted-foreground text-sm truncate">
                      @{actor.handle}
                    </div>
                    {actor.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {actor.description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p>No people found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
