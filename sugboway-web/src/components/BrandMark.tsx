/**
 * BrandMark — SugboWay's logo as a crisp inline SVG (a route pin: a map-pin
 * whose face holds a two-stop journey). Replaces the old raster Logo.png, which
 * was a full logo-mockup image and turned to mush at small sizes. Scales sharply
 * from ~16px to splash size and inherits the sand/sea palette.
 */
/**
 * `mono` renders a white-on-transparent version so the mark reads cleanly when
 * placed on the brand's gradient "sea" tile; the default keeps the full sand/sea
 * palette for standalone use on light/dark surfaces.
 */
const BrandMark = ({
  className = "w-8 h-8",
  mono = false,
}: {
  className?: string;
  mono?: boolean;
}) => (
  <svg
    viewBox="0 0 32 40"
    className={className}
    role="img"
    aria-label="SugboWay"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {mono ? (
      <>
        {/* Pin body — white on the enamel tile */}
        <path
          d="M16 1C8.27 1 2 7.05 2 14.5 2 23.4 12.6 34.7 15.06 38.2a1.15 1.15 0 0 0 1.88 0C19.4 34.7 30 23.4 30 14.5 30 7.05 23.73 1 16 1Z"
          fill="#ffffff"
        />
        {/* Pin face — deep-enamel punch-through so it reads on the red plate */}
        <circle cx="16" cy="14.2" r="8.4" fill="#9E2A1D" />
        <path
          d="M11.6 17.4C13 15 14.4 14 16 12.2c1.3-1.5 2.6-1.9 4.4-2.9"
          stroke="#ffffff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="11.6" cy="17.4" r="2.1" fill="#ffffff" />
        <circle cx="20.4" cy="9.3" r="2.1" fill="#ffffff" />
      </>
    ) : (
      <>
        {/* Pin body — enamel vermilion */}
        <path
          d="M16 1C8.27 1 2 7.05 2 14.5 2 23.4 12.6 34.7 15.06 38.2a1.15 1.15 0 0 0 1.88 0C19.4 34.7 30 23.4 30 14.5 30 7.05 23.73 1 16 1Z"
          fill="#C0392B"
        />
        {/* Pin face — steel paper */}
        <circle cx="16" cy="14.2" r="8.4" fill="#EFF0ED" />
        {/* Journey: origin (ink) → connector → destination (enamel) */}
        <path
          d="M11.6 17.4C13 15 14.4 14 16 12.2c1.3-1.5 2.6-1.9 4.4-2.9"
          stroke="#191C1E"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="11.6" cy="17.4" r="2.1" fill="#191C1E" />
        <circle cx="20.4" cy="9.3" r="2.1" fill="#C0392B" />
      </>
    )}
  </svg>
);

export default BrandMark;
