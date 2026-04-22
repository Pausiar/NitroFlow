interface BrandLogoProps {
  size?: number;
  compact?: boolean;
}

export function BrandLogo({ size = 22, compact = false }: BrandLogoProps) {
  const markSize = Math.max(18, size);

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="NitroFlow logo"
      >
        <defs>
          <linearGradient id="nf-desktop-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#64D2FF" />
            <stop offset="1" stopColor="#0078D4" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#nf-desktop-grad)" />
        <path d="M10 22.5L14.5 9.5h3L13 22.5h-3zm6 0l4.5-13h3L19 22.5h-3z" fill="#fff" />
      </svg>

      {!compact ? (
        <span className="inline-flex items-center font-semibold tracking-tight text-fluent-text">
          <span>Nitro</span>
          <span className="text-[#64D2FF]">Flow</span>
        </span>
      ) : null}
    </span>
  )
}
