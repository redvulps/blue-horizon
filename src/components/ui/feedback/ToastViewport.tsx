import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, selectToasts } from "@/stores/toastStore";

export function ToastViewport() {
  const toasts = useToastStore(selectToasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[70] flex w-[min(92vw,360px)] flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon =
          toast.variant === "success"
            ? CheckCircle2
            : toast.variant === "error"
              ? AlertCircle
              : Info;

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-lg border bg-background p-3 shadow-lg backdrop-blur",
              toast.variant === "success" && "border-emerald-600/30 bg-emerald-500/10",
              toast.variant === "error" && "border-destructive/40 bg-destructive/10",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <Icon
                className={cn(
                  "size-4 mt-0.5 shrink-0",
                  toast.variant === "success" && "text-emerald-600",
                  toast.variant === "error" && "text-destructive",
                  toast.variant === "info" && "text-muted-foreground",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Dismiss toast"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
