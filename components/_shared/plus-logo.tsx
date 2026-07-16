// components/_shared/plus-logo.tsx
// SVG recreation of the Plus Company mark (Brand Guidelines 2024): a plus
// built from colored cells with a translucent 45° extrusion toward the
// lower-left. Vector, so it stays crisp at any size (sidebar, login, favicon).

interface PlusLogoProps {
  size?: number;
  className?: string;
}

export default function PlusLogo({ size = 28, className }: PlusLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 125 125"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Plus Company"
      role="img"
    >
      {/* Extrusion bands (back to front) */}
      {/* Top-left band — light pink */}
      <path d="M75 0 L25 50 L25 75 L75 25 Z" fill="#f7b0c9" />
      {/* Left band — light blue */}
      <path d="M50 25 L0 75 L0 100 L50 50 Z" fill="#abebf2" />
      {/* Big lower band — yellow */}
      <path d="M50 50 L75 50 L25 100 L0 100 Z" fill="#ffc929" />
      {/* Under the bottom cell — pink overlap */}
      <path d="M75 50 L25 100 L25 125 L75 75 Z" fill="#f2739e" opacity="0.85" />
      {/* Bottom band — light pink */}
      <path d="M75 75 L100 75 L50 125 L25 125 Z" fill="#f7b0c9" />

      {/* Plus cells */}
      {/* Top cell: pink / red diagonal split */}
      <path d="M75 0 L100 0 L75 25 Z" fill="#f2739e" />
      <path d="M100 0 L100 25 L75 25 Z" fill="#f54236" />
      {/* Left cell: blue with green triangle */}
      <rect x="50" y="25" width="25" height="25" fill="#66d9e5" />
      <path d="M50 25 L75 25 L75 50 Z" fill="#4db04f" />
      {/* Center cell: purple */}
      <rect x="75" y="25" width="25" height="25" fill="#594a99" />
      {/* Right cell: blue with green triangle */}
      <rect x="100" y="25" width="25" height="25" fill="#66d9e5" />
      <path d="M100 25 L125 25 L100 50 Z" fill="#4db04f" />
      {/* Bottom cell: red / pink diagonal split */}
      <path d="M75 50 L100 50 L75 75 Z" fill="#f54236" />
      <path d="M100 50 L100 75 L75 75 Z" fill="#f2739e" />
    </svg>
  );
}
