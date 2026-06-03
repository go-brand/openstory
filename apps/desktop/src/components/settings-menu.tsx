import { HugeiconsIcon, Settings01Icon } from "../lib/icons";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuItemCheck,
  MenuGroup,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
} from "./ui/menu";
import { useTheme } from "./theme-provider";
import type { Theme } from "../../electron/types";

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger
        className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
        aria-label="Settings"
      >
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" sideOffset={6} className="w-52">
        <MenuGroup>
          <MenuSubmenuRoot>
            <MenuSubmenuTrigger>
              <span className="flex-1">Theme</span>
              <span className="text-xs text-muted-foreground capitalize">{theme}</span>
            </MenuSubmenuTrigger>
            <MenuContent alignOffset={-4} className="w-40">
              {THEME_OPTIONS.map(({ value, label }) => (
                <MenuItem key={value} onClick={() => setTheme(value)}>
                  <MenuItemCheck checked={theme === value} />
                  <span>{label}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </MenuSubmenuRoot>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
