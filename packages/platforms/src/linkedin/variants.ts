import type { CanonicalVariant } from '../types.js';

export const LINKEDIN_VARIANTS: CanonicalVariant[] = [
  {
    id: 'text-short',
    label: 'Short text',
    description: 'Under 100 chars, no media',
  },
  {
    id: 'text-long-show-more',
    label: 'Long text (show more)',
    description: '600+ chars triggering truncation',
  },
  {
    id: 'image-single',
    label: 'Single image (landscape)',
    description: 'One landscape image',
  },
  {
    id: 'image-portrait',
    label: 'Single image (portrait)',
    description: 'One portrait image, max-height crop',
  },
  {
    id: 'image-carousel',
    label: 'Image carousel',
    description: 'Four images with indicators',
  },
  {
    id: 'document',
    label: 'Document',
    description: 'PDF or document card with page count',
  },
  { id: 'video', label: 'Video', description: 'Native video player card' },
  {
    id: 'repost-with-comment',
    label: 'Repost with comment',
    description: 'Nested quoted post',
  },
  { id: 'poll', label: 'Poll', description: '4-option poll with bars' },
];
