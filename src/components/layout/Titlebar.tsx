import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Square, X, Search, Loader2, RotateCcw, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { minimizeWindow, maximizeWindow, closeWindow, isMaximized } from "@/lib/window";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useRefresh } from "@/contexts/useRefresh";
import { useIsMacPlatform } from "@/hooks/usePlatform";
import { RestoreIcon } from "@/components/layout/titlebar/RestoreIcon";
import { SearchResultItem } from "@/components/layout/titlebar/SearchResultItem";
import { useQuickSearchResults } from "@/hooks/useSearch";

export function Titlebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMacPlatform = useIsMacPlatform();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Check if this navigation came from the sidebar (marked with isRootNav state)
    const locationState = location.state as { isRootNav?: boolean } | null;
    const isRootNavigation = locationState?.isRootNav === true;

    // Defines routes where the back button should be disabled
    // These are the main sidebar navigation destinations
    const isRootRoute = [
      "/",
      "/feeds",
      "/lists",
      "/chat",
      "/notifications",
      "/settings",
      "/profile", // Root profile route (accessed via sidebar)
    ].includes(location.pathname);

    // Disable back button for root routes OR sidebar navigations
    if (isRootRoute || isRootNavigation) {
      setCanGoBack(false);
      return;
    }

    // Check if we can go back using window.history.state
    // react-router-dom maintains an 'idx' in the history state
    const state = window.history.state as { idx: number } | null;
    setCanGoBack((state?.idx || 0) > 0);
  }, [location]);

  const handleBack = () => {
    navigate(-1);
  };
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { refreshAll, isRefreshing } = useRefresh();
  const [maximized, setMaximized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { data: searchResults, isFetching: isSearching } = useQuickSearchResults({
    query: searchQuery,
    enabled: isAuthenticated,
  });
  const visibleSearchResults = searchQuery.trim() ? searchResults : null;

  // Check initial maximized state
  useEffect(() => {
    isMaximized().then(setMaximized).catch(console.error);
  }, []);

  // Listen for window resize to update maximized state
  useEffect(() => {
    const handleResize = () => {
      isMaximized().then(setMaximized).catch(console.error);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle click outside to close search results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [visibleSearchResults]);

  const totalResults =
    (visibleSearchResults?.actors.length || 0) +
    (visibleSearchResults?.posts.length || 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!visibleSearchResults || totalResults === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalResults);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalResults) % totalResults);
        break;
      case "Enter":
        e.preventDefault();
        handleSelectResult(selectedIndex);
        break;
      case "Escape":
        e.preventDefault();
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
        break;
    }
  };

  const handleSelectResult = (index: number) => {
    if (!visibleSearchResults) return;

    const actorCount = visibleSearchResults.actors.length;
    if (index < actorCount) {
      const actor = visibleSearchResults.actors[index];
      navigate(`/profile/${actor.handle}`);
    } else {
      const post = visibleSearchResults.posts[index - actorCount];
      // Convert AT URI to path: at://did:plc:xxx/app.bsky.feed.post/xxx -> post/did:plc:xxx/app.bsky.feed.post/xxx
      const postPath = post.uri.replace("at://", "");
      navigate(`/post/${postPath}`);
    }

    setSearchQuery("");
    setIsSearchFocused(false);
  };

  const handleMinimize = async () => {
    try {
      await minimizeWindow();
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  };

  const handleMaximize = async () => {
    try {
      await maximizeWindow();
      setMaximized(!maximized);
    } catch (error) {
      console.error("Failed to maximize window:", error);
    }
  };

  const handleClose = async () => {
    try {
      await closeWindow();
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  };

  const titleBlock = (
    <div className="flex items-center gap-2 px-3 h-full" data-tauri-drag-region>
      <span className="text-sm font-semibold text-foreground" data-tauri-drag-region>
        Blue Horizon
      </span>
    </div>
  );

  const windowControls = (
    <div className="flex items-center h-full">
      {isMacPlatform ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-muted"
            onClick={handleMinimize}
            aria-label="Minimize"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-muted"
            onClick={handleMaximize}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <RestoreIcon className="w-[10px] h-[10px]" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-muted"
            onClick={handleMinimize}
            aria-label="Minimize"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-muted"
            onClick={handleMaximize}
            aria-label={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? (
              <RestoreIcon className="w-[10px] h-[10px]" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div
      className="h-10 bg-background border-b border-border flex items-center justify-between select-none"
      data-tauri-drag-region
    >
      {/* Left side */}
      {isMacPlatform ? windowControls : titleBlock}

      {/* Center - Search bar and refresh */}
      <div className="flex-1 max-w-md mx-4 relative flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canGoBack}
          onClick={handleBack}
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div ref={searchContainerRef} className="flex-1 relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder={isAuthenticated ? "Search..." : "Sign in to search"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={handleKeyDown}
              disabled={!isAuthenticated}
              className="h-7 pl-8 pr-8 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background w-full"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {isSearchFocused && visibleSearchResults && totalResults > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
              >
                <div className="max-h-80 overflow-y-auto p-1">
                  {/* Actors Section */}
                  {visibleSearchResults.actors.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                        People
                      </p>
                      {visibleSearchResults.actors.map((actor, index) => (
                        <SearchResultItem
                          key={actor.did}
                          type="actor"
                          actor={actor}
                          isSelected={selectedIndex === index}
                          onClick={() => handleSelectResult(index)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Posts Section */}
                  {visibleSearchResults.posts.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase mt-1">
                        Posts
                      </p>
                      {visibleSearchResults.posts.map((post, index) => {
                        const resultIndex = visibleSearchResults.actors.length + index;
                        return (
                          <SearchResultItem
                            key={post.uri}
                            type="post"
                            post={post}
                            isSelected={selectedIndex === resultIndex}
                            onClick={() => handleSelectResult(resultIndex)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="border-t border-border px-3 py-1.5 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>{" "}
                    Navigate{" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] ml-2">
                      Enter
                    </kbd>{" "}
                    Select{" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] ml-2">
                      Esc
                    </kbd>{" "}
                    Close
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* No results message */}
          <AnimatePresence>
            {isSearchFocused &&
              searchQuery.trim() &&
              visibleSearchResults &&
              totalResults === 0 &&
              !isSearching && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg p-4 z-50"
                >
                  <p className="text-sm text-muted-foreground text-center">
                    No results found for "{searchQuery}"
                  </p>
                </motion.div>
              )}
          </AnimatePresence>
        </div>

        {/* Refresh button on the right side */}
        {isAuthenticated && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-muted/50"
            onClick={refreshAll}
            disabled={isRefreshing}
            title="Refresh all data"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {/* Right side */}
      {isMacPlatform ? titleBlock : windowControls}
    </div>
  );
}
