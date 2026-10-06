import type { SVGProps } from "react";

/** Simple vector icons of the design: 2 px stroke, round caps, `currentColor`, decorative. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <Icon>
      <path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-1-2.5c3 0 6-1.5 6-6.5a5 5 0 0 0-1.5-3.5 4.5 4.5 0 0 0 0-3.5s-1.2-.4-3.8 1.4a13 13 0 0 0-7 0C5.2 1.6 4 2 4 2a4.5 4.5 0 0 0 0 3.5A5 5 0 0 0 2.5 9c0 5 3 6.5 6 6.5a3 3 0 0 0-1 2.5V21" />
    </Icon>
  );
}

export function DiscordIcon() {
  return (
    <Icon>
      <path d="M8 17c-2 0-4-1-5-2 0-5 1.5-9 3.5-11 1.5-.6 3-.9 4-1l.5 1.2a14 14 0 0 1 2 0L13.5 3c1 .1 2.5.4 4 1 2 2 3.5 6 3.5 11-1 1-3 2-5 2l-1-2M8 17l1-2" />
      <circle cx="9" cy="11.5" r="1" />
      <circle cx="15" cy="11.5" r="1" />
    </Icon>
  );
}

export function EyeIcon() {
  return (
    <Icon>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon() {
  return (
    <Icon>
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon width="18" height="18">
      <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon width="18" height="18">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}
