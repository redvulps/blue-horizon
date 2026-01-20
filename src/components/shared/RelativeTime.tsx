import { useMemo, useState, useEffect } from "react";

interface RelativeTimeProps {
  date: string | Date;
  className?: string;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return "now";
  }

  if (diffMins < 60) {
    return `${diffMins}m`;
  }

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  // Format as date for older posts
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };

  // Add year if not current year
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = "numeric";
  }

  return date.toLocaleDateString(undefined, options);
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [, forceUpdate] = useState(0);
  const dateObj = useMemo(
    () => (typeof date === "string" ? new Date(date) : date),
    [date],
  );

  useEffect(() => {
    // Update every minute to keep the relative time fresh
    const interval = setInterval(() => {
      forceUpdate((n) => n + 1);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Calculate relative time on every render (triggered by interval)
  const relativeString = getRelativeTime(dateObj);

  const fullDate = useMemo(
    () =>
      dateObj.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [dateObj],
  );

  return (
    <time dateTime={dateObj.toISOString()} title={fullDate} className={className}>
      {relativeString}
    </time>
  );
}
