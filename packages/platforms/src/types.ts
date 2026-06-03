import type { Viewport } from "@gobrand/openstory-config";

export type PlatformViewportSet = {
  desktop: Viewport;
  mobile: Viewport;
};

export type CanonicalVariant = {
  id: string;
  label: string;
  description: string;
};

export type PlatformMetadata = {
  name: string;
  viewports: PlatformViewportSet;
  variants: CanonicalVariant[];
};
