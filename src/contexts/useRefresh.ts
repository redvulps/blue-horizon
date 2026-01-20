import { useContext } from "react";
import { RefreshContext } from "@/contexts/RefreshContextValue";

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error("useRefresh must be used within a RefreshProvider");
  }
  return context;
}
