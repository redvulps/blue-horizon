import { useEffect } from "react";
import { useUIStore, selectTheme } from "@/stores/uiStore";

export function useTheme() {
  const theme = useUIStore(selectTheme);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);
}
