import type { OpenStoryApi } from '../electron/preload';

declare global {
  interface Window {
    openStory: OpenStoryApi;
  }
}

export {};
