interface RestoreIconProps {
  className?: string;
}

export function RestoreIcon({ className }: RestoreIconProps) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 0H9C9.55 0 10 0.45 10 1V8C10 8.55 9.55 9 9 9H8V8H9V1H2V2H1V1C1 0.45 1.45 0 2 0Z"
        fill="currentColor"
      />
      <rect
        x="0"
        y="2"
        width="8"
        height="8"
        rx="1"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
