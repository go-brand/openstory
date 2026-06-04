import { cn } from "../../lib/utils";

// Panel-toggle icon: the right-hand panel region fills in (scaleX 0 -> 1) when
// open, matching the sidebar's own width animation. Ported from the
// tanstack-start app's DetailSidebar trigger.
export function AnimatedPanelIcon({ isOpen, className }: { isOpen: boolean; className?: string }) {
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
        <clipPath id="os-right-panel-clip">
          <rect x="15" y="3" width="6" height="18" rx="2" />
        </clipPath>
      </defs>

      {/* Outer frame */}
      <rect width="18" height="18" x="3" y="3" rx="2" />

      {/* Divider between main area and right panel */}
      <path d="M15 3v18" />

      {/* Animated fill, clipped to the right panel, scaling from its right edge */}
      <g clipPath="url(#os-right-panel-clip)">
        <rect
          x="15"
          y="3"
          width="6"
          height="18"
          fill="currentColor"
          stroke="none"
          className="transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            transformOrigin: "21px 12px",
            transform: isOpen ? "scaleX(1)" : "scaleX(0)",
          }}
        />
      </g>
    </svg>
  );
}
