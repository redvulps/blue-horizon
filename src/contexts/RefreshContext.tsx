import React, { type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshContext } from "@/contexts/RefreshContextValue";

interface RefreshProviderProps {
  children: ReactNode;
}

export function RefreshProvider({ children }: RefreshProviderProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshAll = React.useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500); // Brief loading state
  }, [queryClient]);

  const refreshTimeline = React.useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient]);

  const refreshProfile = React.useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient]);

  const refreshNotifications = React.useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient]);

  const value = {
    refreshAll,
    refreshTimeline,
    refreshProfile,
    refreshNotifications,
    isRefreshing,
  };

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}
