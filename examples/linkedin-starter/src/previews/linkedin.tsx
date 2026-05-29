import { useState } from 'react';
import { useOpenStoryViewport } from '@gobrand/openstory-runtime';

const VIEWPORT_WIDTH = {
  desktop: 552,
  mobile: 360,
} as const;

export type LinkedinReaction =
  | 'like'
  | 'love'
  | 'insightful'
  | 'celebrate'
  | 'funny';

export type LinkedinPreviewProps = {
  author: {
    name: string;
    headline: string;
    avatar: string;
  };
  text: string;
  postedAt: string; // ISO 8601
  media?:
    | { type: 'image-single'; src: string; alt?: string }
    | { type: 'image-portrait'; src: string; alt?: string }
    | { type: 'image-carousel'; images: { src: string; alt?: string }[] }
    | { type: 'document'; title: string; pages: number; thumbnail: string }
    | { type: 'video'; thumbnail: string; durationSec: number }
    | {
        type: 'poll';
        question: string;
        options: { label: string; votes: number }[];
        expiresAt: string;
      };
  repost?: {
    author: { name: string; headline: string; avatar: string };
    text: string;
    postedAt: string;
  };
  reactions: Partial<Record<LinkedinReaction, number>>;
  commentCount: number;
  repostCount: number;
  sendCount?: number;
};

const SHOW_MORE_THRESHOLD = 280;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

function ReactionStack({
  reactions,
}: {
  reactions: LinkedinPreviewProps['reactions'];
}) {
  const total = Object.values(reactions).reduce((a, b) => a + (b ?? 0), 0);
  if (total === 0) return null;
  const icons = ['👍', '❤️', '💡'].slice(
    0,
    Math.min(3, Object.keys(reactions).length)
  );
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-600">
      <div className="flex -space-x-1">
        {icons.map((i, idx) => (
          <span
            key={idx}
            className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px]"
            style={{ boxShadow: '0 0 0 1px #fff' }}
          >
            {i}
          </span>
        ))}
      </div>
      <span>{total.toLocaleString()}</span>
    </div>
  );
}

function ActionButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-center gap-2 rounded px-2 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function LinkedinPreview(props: LinkedinPreviewProps) {
  const viewport = useOpenStoryViewport();
  const maxWidth = VIEWPORT_WIDTH[viewport];
  const [expanded, setExpanded] = useState(false);
  const showTruncation = !expanded && props.text.length > SHOW_MORE_THRESHOLD;
  const visibleText = showTruncation
    ? `${props.text.slice(0, SHOW_MORE_THRESHOLD)}…`
    : props.text;

  return (
    <div className="flex w-full justify-center px-4 py-6">
      <article
        style={{ maxWidth, width: '100%' }}
        className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-[14px] text-neutral-900"
      >
        <header className="flex items-start gap-2 px-4 pt-3">
          <img
            src={props.author.avatar}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="leading-tight font-semibold">
                {props.author.name}
              </span>
            </div>
            <div className="truncate text-xs leading-tight text-neutral-600">
              {props.author.headline}
            </div>
            <div className="text-xs leading-tight text-neutral-600">
              {formatRelative(props.postedAt)} · 🌐
            </div>
          </div>
          <button
            type="button"
            aria-label="More"
            className="-mr-2 px-2 py-1 text-neutral-600"
          >
            ⋯
          </button>
        </header>

        <div className="px-4 pt-2 pb-1 text-[14px] leading-[1.45]">
          <p className="whitespace-pre-wrap">{visibleText}</p>
          {showTruncation && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 text-neutral-600 hover:text-blue-700 hover:underline"
            >
              …more
            </button>
          )}
        </div>

        {props.media && <MediaSlot media={props.media} />}
        {props.repost && <RepostCard repost={props.repost} />}

        <div className="flex items-center justify-between px-4 py-1 text-xs text-neutral-600">
          <ReactionStack reactions={props.reactions} />
          <div className="flex items-center gap-2">
            {props.commentCount > 0 && (
              <span>{props.commentCount.toLocaleString()} comments</span>
            )}
            {props.repostCount > 0 && (
              <span>· {props.repostCount.toLocaleString()} reposts</span>
            )}
          </div>
        </div>

        <div className="mx-3 border-t border-neutral-200" />

        <div className="flex items-stretch px-1 py-1">
          <ActionButton icon="👍" label="Like" />
          <ActionButton icon="💬" label="Comment" />
          <ActionButton icon="🔁" label="Repost" />
          <ActionButton icon="📨" label="Send" />
        </div>
      </article>
    </div>
  );
}

function MediaSlot({
  media,
}: {
  media: NonNullable<LinkedinPreviewProps['media']>;
}) {
  if (media.type === 'image-single') {
    return (
      <img src={media.src} alt={media.alt ?? ''} className="block w-full" />
    );
  }
  if (media.type === 'image-portrait') {
    return (
      <div className="bg-neutral-100" style={{ maxHeight: 720 }}>
        <img
          src={media.src}
          alt={media.alt ?? ''}
          className="mx-auto block max-h-[720px] object-contain"
        />
      </div>
    );
  }
  if (media.type === 'image-carousel') {
    return (
      <div className="relative overflow-hidden">
        <div className="flex snap-x snap-mandatory overflow-x-auto">
          {media.images.map((img, idx) => (
            <img
              key={idx}
              src={img.src}
              alt={img.alt ?? ''}
              className="aspect-[4/5] w-full flex-none snap-center object-cover"
            />
          ))}
        </div>
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {media.images.map((_, idx) => (
            <span key={idx} className="h-1.5 w-1.5 rounded-full bg-white/80" />
          ))}
        </div>
      </div>
    );
  }
  if (media.type === 'document') {
    return (
      <div className="border-t border-neutral-200">
        <div className="relative aspect-[4/3] bg-neutral-100">
          <img
            src={media.thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
            {media.pages} pages
          </div>
        </div>
        <div className="border-t border-neutral-200 px-4 py-2 text-sm font-medium">
          {media.title}
        </div>
      </div>
    );
  }
  if (media.type === 'video') {
    const min = Math.floor(media.durationSec / 60);
    const sec = (media.durationSec % 60).toString().padStart(2, '0');
    return (
      <div className="relative">
        <img src={media.thumbnail} alt="" className="block w-full" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-black/60 text-2xl text-white">
            ▶
          </div>
        </div>
        <div className="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
          {min}:{sec}
        </div>
      </div>
    );
  }
  if (media.type === 'poll') {
    const total = media.options.reduce((sum, o) => sum + o.votes, 0);
    return (
      <div className="border-t border-neutral-200 px-4 py-3">
        <div className="mb-2 text-sm font-medium">{media.question}</div>
        <div className="flex flex-col gap-2">
          {media.options.map((opt, idx) => {
            const pct = total === 0 ? 0 : Math.round((opt.votes / total) * 100);
            return (
              <button
                key={idx}
                type="button"
                className="relative flex items-center justify-between overflow-hidden rounded-full border border-neutral-300 px-3 py-1 text-sm"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-blue-100"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative font-medium">{opt.label}</span>
                <span className="relative text-xs text-neutral-600">
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-neutral-600">
          {total.toLocaleString()} votes · ends{' '}
          {formatRelative(media.expiresAt)}
        </div>
      </div>
    );
  }
  return null;
}

function RepostCard({
  repost,
}: {
  repost: NonNullable<LinkedinPreviewProps['repost']>;
}) {
  return (
    <div className="mx-3 mt-1 mb-3 rounded-md border border-neutral-200">
      <header className="flex items-start gap-2 px-3 pt-2">
        <img
          src={repost.author.avatar}
          alt=""
          className="h-9 w-9 rounded-full"
        />
        <div className="min-w-0">
          <div className="text-[13px] leading-tight font-semibold">
            {repost.author.name}
          </div>
          <div className="truncate text-[11px] leading-tight text-neutral-600">
            {repost.author.headline}
          </div>
          <div className="text-[11px] text-neutral-600">
            {formatRelative(repost.postedAt)}
          </div>
        </div>
      </header>
      <p className="px-3 pt-2 pb-3 text-[13px] whitespace-pre-wrap">
        {repost.text}
      </p>
    </div>
  );
}
