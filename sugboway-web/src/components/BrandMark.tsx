/**
 * BrandMark — SugboWay's logo as a crisp inline SVG (a route pin: a map-pin
 * whose face holds a two-stop journey). Replaces the old raster Logo.png, which
 * was a full logo-mockup image and turned to mush at small sizes. Scales sharply
 * from ~16px to splash size and inherits the sand/sea palette.
 */
const BrandMark = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg
    viewBox="0 0 32 40"
    className={className}
    role="img"
    aria-label="SugboWay"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Pin body — Cebu Blue */}
    <path
      d="M16 1C8.27 1 2 7.05 2 14.5 2 23.4 12.6 34.7 15.06 38.2a1.15 1.15 0 0 0 1.88 0C19.4 34.7 30 23.4 30 14.5 30 7.05 23.73 1 16 1Z"
      fill="#0056B3"
    />
    {/* Pin face */}
    <circle cx="16" cy="14.2" r="8.4" fill="#FAF7F1" />
    {/* Journey: origin (clay) → connector → destination (blue) */}
    <path
      d="M11.6 17.4C13 15 14.4 14 16 12.2c1.3-1.5 2.6-1.9 4.4-2.9"
      stroke="#0056B3"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="11.6" cy="17.4" r="2.1" fill="#C5613B" />
    <circle cx="20.4" cy="9.3" r="2.1" fill="#0056B3" />
  </svg>
);

export default BrandMark;
