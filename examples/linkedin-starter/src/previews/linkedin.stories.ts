import { defineStories } from '@gobrand/openstory-config';
import { LinkedinPreview, type LinkedinPreviewProps } from './linkedin';

const author = {
  name: 'Jane Doe',
  headline: 'Founder · GoBrand · Building the future of social',
  avatar: 'https://i.pravatar.cc/96?img=47',
};

const LONG_TEXT = `Three years ago we set out to build a social media tool that doesn't treat creators like products. Today we crossed 10,000 customers and I want to share what we learned about pricing, trust, and shipping in public.

When we started, we were told our price was too high. Then we were told it was too low. The truth is, pricing isn't a number — it's a promise. Every dollar a customer pays is them saying "I trust you to keep solving my problem."

Here's what changed everything: we stopped optimizing for conversion and started optimizing for retention. The result wasn't a smaller funnel — it was a deeper one.`;

const now = () => new Date();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

export default defineStories<LinkedinPreviewProps>({
  component: LinkedinPreview,
  platform: 'linkedin',
  viewports: {
    desktop: { width: 552, dpr: 2 },
    mobile: { width: 360, dpr: 3 },
  },
  stories: {
    TextShort: {
      author,
      text: 'Shipped multi-channel scheduling today. Three years in the making. Sleep is for next quarter.',
      postedAt: ago(1000 * 60 * 12),
      reactions: { like: 124, love: 18, insightful: 7 },
      commentCount: 11,
      repostCount: 4,
    },

    TextLongShowMore: {
      args: {
        author,
        text: LONG_TEXT,
        postedAt: ago(1000 * 60 * 60 * 4),
        reactions: { like: 642, love: 88, insightful: 41 },
        commentCount: 73,
        repostCount: 22,
      },
      label: 'Long text (show more)',
    },

    ImageSingle: {
      author,
      text: 'New office, same team.',
      postedAt: ago(1000 * 60 * 60 * 8),
      media: {
        type: 'image-single',
        src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
        alt: 'Office',
      },
      reactions: { like: 312, love: 41 },
      commentCount: 14,
      repostCount: 3,
    },

    ImagePortrait: {
      author,
      text: 'The mountains never disappoint.',
      postedAt: ago(1000 * 60 * 60 * 24),
      media: {
        type: 'image-portrait',
        src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=80',
        alt: 'Mountains',
      },
      reactions: { like: 89, insightful: 4 },
      commentCount: 6,
      repostCount: 1,
    },

    ImageCarousel: {
      author,
      text: 'Year in review.',
      postedAt: ago(1000 * 60 * 60 * 48),
      media: {
        type: 'image-carousel',
        images: [
          {
            src: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=80',
          },
          {
            src: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=900&q=80',
          },
          {
            src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=80',
          },
          {
            src: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=900&q=80',
          },
        ],
      },
      reactions: { like: 410, love: 62, insightful: 9 },
      commentCount: 28,
      repostCount: 7,
    },

    Document: {
      author,
      text: 'Our 2026 pricing playbook. 14 pages. Free.',
      postedAt: ago(1000 * 60 * 60 * 18),
      media: {
        type: 'document',
        title: '2026 SaaS Pricing Playbook',
        pages: 14,
        thumbnail:
          'https://images.unsplash.com/photo-1453928582365-b6ad33cbcf64?w=900&q=80',
      },
      reactions: { like: 1820, love: 311, insightful: 220 },
      commentCount: 192,
      repostCount: 84,
    },

    Video: {
      author,
      text: 'Demo of the new scheduler.',
      postedAt: ago(1000 * 60 * 60 * 6),
      media: {
        type: 'video',
        thumbnail:
          'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&q=80',
        durationSec: 162,
      },
      reactions: { like: 488, love: 71 },
      commentCount: 34,
      repostCount: 11,
    },

    RepostWithComment: {
      author,
      text: 'This is exactly how we think about it.',
      postedAt: ago(1000 * 60 * 60 * 30),
      repost: {
        author: {
          name: 'Marc Lou',
          headline: 'Indie maker · 20+ ships',
          avatar: 'https://i.pravatar.cc/96?img=12',
        },
        text: 'Ship in public. Price for value. Ignore the rest.',
        postedAt: ago(1000 * 60 * 60 * 32),
      },
      reactions: { like: 211, insightful: 33 },
      commentCount: 12,
      repostCount: 5,
    },

    Poll: {
      author,
      text: 'Be honest. What kills your social media schedule?',
      postedAt: ago(1000 * 60 * 60 * 10),
      media: {
        type: 'poll',
        question: 'What kills your social media schedule?',
        options: [
          { label: 'Running out of ideas', votes: 412 },
          { label: 'Not enough time', votes: 318 },
          { label: 'Inconsistent results', votes: 144 },
          { label: 'Tooling friction', votes: 88 },
        ],
        expiresAt: inFuture(1000 * 60 * 60 * 24 * 3),
      },
      reactions: { like: 67, insightful: 14 },
      commentCount: 9,
      repostCount: 2,
    },
  },
});

// Touch `now` to satisfy unused checks if any
void now;
