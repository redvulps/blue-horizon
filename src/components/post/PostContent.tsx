import { RichText } from "@/components/shared/RichText";
import type { Facet } from "@/types/bluesky";
import { cn } from "@/lib/utils";

interface PostContentProps {
  text: string;
  facets?: Facet[];
  className?: string;
}

export function PostContent({ text, facets, className }: PostContentProps) {
  return (
    <div className={cn("text-foreground", className)}>
      <RichText text={text} facets={facets} />
    </div>
  );
}
