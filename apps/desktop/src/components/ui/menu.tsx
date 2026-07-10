import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { HugeiconsIcon, ArrowRight01Icon, Tick02Icon } from "../../lib/icons";
import { cn } from "../../lib/utils";

function Menu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger {...props} />;
}

function MenuContent({
  className,
  children,
  align,
  side,
  sideOffset = 4,
  alignOffset = 0,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> & {
  align?: MenuPrimitive.Positioner.Props["align"];
  side?: MenuPrimitive.Positioner.Props["side"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <MenuPrimitive.Popup
          {...props}
          className={cn(
            "z-50 min-w-[10rem] rounded-md border border-input bg-popover text-popover-foreground shadow-lg",
            "origin-[var(--transform-origin)] transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          <div className="space-y-0.5 p-1">{children}</div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      {...props}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-hidden transition-colors select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
    />
  );
}

function MenuRadioGroup(props: React.ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup {...props} />;
}

function MenuRadioItem({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      {...props}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-hidden transition-colors select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
    />
  );
}

function MenuRadioItemIndicator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioItemIndicator>) {
  return (
    <MenuPrimitive.RadioItemIndicator
      keepMounted
      {...props}
      className={cn(
        "flex size-4 items-center justify-center data-[unchecked]:invisible",
        className,
      )}
    >
      <HugeiconsIcon icon={Tick02Icon} className="size-4 text-brand" />
    </MenuPrimitive.RadioItemIndicator>
  );
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator {...props} className={cn("-mx-1 my-1 h-px bg-border", className)} />
  );
}

function MenuGroup(props: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group {...props} />;
}

function MenuSubmenuRoot(props: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>) {
  return <MenuPrimitive.SubmenuRoot {...props} />;
}

function MenuSubmenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger>) {
  return (
    <MenuPrimitive.SubmenuTrigger
      {...props}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-hidden select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground",
        className,
      )}
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} className="ms-auto size-3.5" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

// Convenience: a leading check slot for "currently selected" rows.
function MenuItemCheck({ checked }: { checked: boolean }) {
  return (
    <span className="flex size-4 items-center justify-center">
      {checked ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-brand" /> : null}
    </span>
  );
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuItemCheck,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuGroup,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
};
