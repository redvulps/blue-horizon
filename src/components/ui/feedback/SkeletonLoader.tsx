import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  animate?: boolean;
}

export function SkeletonLoader({
  className,
  variant = "rectangular",
  width,
  height,
  animate = true,
}: SkeletonLoaderProps) {
  const variantStyles = {
    text: "h-4 w-full",
    circular: "rounded-full aspect-square",
    rectangular: "rounded-md",
  };

  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  if (!animate) {
    return <Skeleton className={cn(variantStyles[variant], className)} style={style} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <Skeleton className={cn(variantStyles[variant], className)} style={style} />
    </motion.div>
  );
}
