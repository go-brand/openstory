import type { PlatformMetadata } from '../types.js';
import { LINKEDIN_VIEWPORTS } from './viewport.js';
import { LINKEDIN_VARIANTS } from './variants.js';

export const linkedinPlatform: PlatformMetadata = {
  platform: 'linkedin',
  viewports: LINKEDIN_VIEWPORTS,
  variants: LINKEDIN_VARIANTS,
};

export { LINKEDIN_VIEWPORTS, LINKEDIN_VARIANTS };
