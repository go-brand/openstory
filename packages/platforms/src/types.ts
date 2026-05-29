import type { Platform, Viewport } from '@gobrand/openstory-config';

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
  platform: Platform;
  viewports: PlatformViewportSet;
  variants: CanonicalVariant[];
};
