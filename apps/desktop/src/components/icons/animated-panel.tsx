import { cn } from "../../lib/utils";

// Panel-toggle icon: the owned panel region fills in (scaleX 0 -> 1) when open,
// matching the shell's width animation.
export function AnimatedPanelIcon({
  isOpen,
  side = "right",
  className,
}: {
  isOpen: boolean;
  side?: "left" | "right";
  className?: string;
}) {
  const isLeft = side === "left";
  const dividerX = isLeft ? 9 : 15;
  const panelX = isLeft ? 3 : 15;
  const transformOrigin = isLeft ? "3px 12px" : "21px 12px";
  const clipPathId = `os-${side}-panel-clip`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
    >
      <defs>
        <clipPath id={clipPathId}>
          <rect x={panelX} y="3" width="6" height="18" rx="2" />
        </clipPath>
      </defs>

      {/* Outer frame */}
      <rect width="18" height="18" x="3" y="3" rx="2" />

      {/* Divider between the panel and main area */}
      <path d={`M${dividerX} 3v18`} />

      {/* Animated fill, clipped to the owned panel and scaling from its outer edge. */}
      <g clipPath={`url(#${clipPathId})`}>
        <rect
          x={panelX}
          y="3"
          width="6"
          height="18"
          fill="currentColor"
          stroke="none"
          className="transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            transformOrigin,
            transform: isOpen ? "scaleX(1)" : "scaleX(0)",
          }}
        />
      </g>
    </svg>
  );
}
