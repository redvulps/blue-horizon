import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
};

export function UserAvatar({
  src,
  alt = "Avatar",
  size = "md",
  className,
}: UserAvatarProps) {
  const initials = alt
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (!src) {
    return (
      <div
        className={cn(
          "rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium",
          sizeClasses[size],
          className,
        )}
        aria-label={alt}
      >
        <span className="text-[0.6em]">{initials || "?"}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn("rounded-full object-cover", sizeClasses[size], className)}
    />
  );
}
