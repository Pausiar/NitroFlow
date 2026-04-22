import type { SVGProps } from "react";

export function Logo({ size = 28, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="nf-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#64D2FF" />
          <stop offset="1" stopColor="#0078D4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#nf-grad)" />
      <path
        d="M10 22.5L14.5 9.5h3L13 22.5h-3zm6 0l4.5-13h3L19 22.5h-3z"
        fill="white"
      />
    </svg>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <Logo size={26} />
      <span className="text-[1.05rem] text-white">
        Nitro<span className="accent-gradient">Flow</span>
      </span>
    </span>
  );
}
