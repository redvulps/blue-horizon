import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCount(count: number, options: { hideZero?: boolean } = {}): string {
  const { hideZero = false } = options;

  if (count === 0 && hideZero) return "";

  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }

  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }

  return count.toString();
}

export function formatMessageTime(dateInput: string | Date | number): string {
  let date: Date;

  if (typeof dateInput === "number") {
    // Unix timestamp in milliseconds
    date = new Date(dateInput);
  } else if (typeof dateInput === "string") {
    // Check if it's a Unix timestamp string
    const timestamp = parseInt(dateInput, 10);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      // Likely a Unix timestamp in milliseconds
      date = new Date(timestamp);
    } else {
      // Try to parse as ISO date string
      // The Bluesky SDK returns dates in ISO 8601 format
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return "Invalid date";
  }

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (days < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
