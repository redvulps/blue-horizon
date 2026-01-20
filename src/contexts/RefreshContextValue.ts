import { createContext } from "react";

export interface RefreshContextType {
  refreshAll: () => void;
  refreshTimeline: () => void;
  refreshProfile: () => void;
  refreshNotifications: () => void;
  isRefreshing: boolean;
}

export const RefreshContext = createContext<RefreshContextType | undefined>(undefined);
