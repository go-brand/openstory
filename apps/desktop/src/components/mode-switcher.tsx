import type { ActiveSelection } from "../../electron/types";
import { ArrowDown01Icon, DashboardSquare01Icon, File01Icon, HugeiconsIcon } from "../lib/icons";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "./ui/menu";

type Mode = ActiveSelection["mode"];

export const MODE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    mode: "design" as const,
    label: "Design System",
    description: "Browse components and stories",
    icon: DashboardSquare01Icon,
  }),
  Object.freeze({
    mode: "docs" as const,
    label: "Documentation",
    description: "Browse project documentation",
    icon: File01Icon,
  }),
]);

export function ModeSwitcher({ mode, onSelect }: { mode: Mode; onSelect: (mode: Mode) => void }) {
  const active = MODE_DESCRIPTORS.find((descriptor) => descriptor.mode === mode)!;

  return (
    <div className="no-drag">
      <Menu>
        <MenuTrigger
          aria-label={`Switch mode: ${active.label}`}
          title={`Switch mode: ${active.label}`}
          className="flex h-7 max-w-[160px] items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.045] data-[popup-open]:bg-foreground/[0.055] max-[1280px]:w-7 max-[1280px]:justify-center max-[1280px]:px-0"
        >
          <HugeiconsIcon icon={active.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate max-[1280px]:hidden">{active.label}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="size-3 shrink-0 text-muted-foreground max-[1280px]:hidden"
          />
        </MenuTrigger>
        <MenuContent align="start" sideOffset={6} className="w-64">
          <MenuRadioGroup value={mode}>
            {MODE_DESCRIPTORS.map((descriptor) => (
              <MenuRadioItem
                key={descriptor.mode}
                value={descriptor.mode}
                closeOnClick
                onClick={() => {
                  if (descriptor.mode !== mode) onSelect(descriptor.mode);
                }}
                className="items-start py-2"
              >
                <HugeiconsIcon
                  icon={descriptor.icon}
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-foreground">
                    {descriptor.label}
                  </span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">
                    {descriptor.description}
                  </span>
                </span>
                <MenuRadioItemIndicator className="mt-0.5 shrink-0" />
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </div>
  );
}
