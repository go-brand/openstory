import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentType } from "react";

type EmbedComponent = {
  id: string;
  component: ComponentType<never>;
  fixtures: Array<{ id: string; label: string; props: unknown }>;
};

export function resolveEmbed(
  components: EmbedComponent[],
  embedId: string,
): { Comp: ComponentType<never>; props: unknown } | null {
  const sep = embedId.indexOf("--");
  if (sep === -1) return null;
  const componentId = embedId.slice(0, sep);
  const storyId = embedId.slice(sep + 2);
  const comp = components.find((c) => c.id === componentId);
  const fixture = comp?.fixtures.find((f) => f.id === storyId);
  if (!comp || !fixture) return null;
  return { Comp: comp.component, props: fixture.props };
}

export function DocHost({
  html,
  embeds,
  components,
}: {
  html: string;
  embeds: string[];
  components: EmbedComponent[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // After the HTML mounts, collect placeholder nodes in DOM order so duplicates
  // are preserved (a Map keyed by id collapses two identical :::story directives
  // onto the last node and produces duplicate React keys).
  const [targets, setTargets] = useState<Array<{ id: string; el: HTMLElement }>>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const arr: Array<{ id: string; el: HTMLElement }> = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-openstory-story]")) {
      const id = el.getAttribute("data-openstory-story");
      if (id) arr.push({ id, el });
    }
    setTargets(arr);
  }, [html]);

  return (
    <div className="openstory-doc-surface min-h-full bg-background text-foreground">
      <style>{DOC_CSS}</style>
      {/* doc HTML comes from a project-local file the developer already trusts
          (same boundary as their own source) — not user-submitted content.
          Colors use the consumer's shadcn tokens (bg-background/text-foreground)
          so prose is readable in any theme; typography is self-contained CSS
          (currentColor + color-mix) so it needs no Tailwind typography plugin. */}
      <div
        ref={rootRef}
        className="openstory-doc mx-auto max-w-3xl px-8 py-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {targets.map(({ id, el }, i) => {
        const resolved = resolveEmbed(components, id);
        // Cast to accept arbitrary props at the render site; the actual props
        // come from the fixture definition so they match the component's contract.
        const Comp = resolved?.Comp as ComponentType<Record<string, unknown>> | undefined;
        return createPortal(
          Comp ? (
            <Comp {...(resolved!.props as Record<string, unknown>)} />
          ) : (
            <span className="openstory-embed-missing">⚠ story not found: {id}</span>
          ),
          el,
          `embed-${i}`,
        );
      })}
    </div>
  );
}

// Self-contained prose typography for rendered Markdown docs. Sizes are relative
// (em) and accents use `currentColor` + `color-mix`, so the sheet adapts to the
// container's resolved text color in any theme without a Tailwind plugin.
const DOC_CSS = `
.openstory-doc { line-height: 1.65; font-size: 14px; }
.openstory-doc > :first-child { margin-top: 0; }
.openstory-doc h1 { font-size: 1.7em; font-weight: 650; line-height: 1.2; letter-spacing: -0.01em; margin: 1.4em 0 0.6em; }
.openstory-doc h2 { font-size: 1.3em; font-weight: 600; line-height: 1.3; margin: 1.6em 0 0.5em; }
.openstory-doc h3 { font-size: 1.1em; font-weight: 600; margin: 1.4em 0 0.4em; }
.openstory-doc p { margin: 0 0 1em; }
.openstory-doc ul, .openstory-doc ol { margin: 0 0 1em; padding-left: 1.4em; }
.openstory-doc ul { list-style: disc; }
.openstory-doc ol { list-style: decimal; }
.openstory-doc li { margin: 0.25em 0; }
.openstory-doc li::marker { color: currentColor; opacity: 0.45; }
.openstory-doc a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.openstory-doc strong { font-weight: 650; }
.openstory-doc code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; background: color-mix(in oklab, currentColor 12%, transparent); padding: 0.12em 0.35em; border-radius: 0.35em; }
.openstory-doc pre { background: color-mix(in oklab, currentColor 8%, transparent); padding: 0.9em 1em; border-radius: 0.6em; overflow-x: auto; margin: 0 0 1em; }
.openstory-doc pre code { background: none; padding: 0; }
.openstory-doc blockquote { margin: 0 0 1em; padding-left: 1em; border-left: 2px solid color-mix(in oklab, currentColor 22%, transparent); opacity: 0.85; }
.openstory-doc hr { border: 0; border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent); margin: 1.5em 0; }
.openstory-doc .openstory-embed { margin: 1.25em 0; }
.openstory-embed-missing { color: #ef4444; font-size: 13px; }
`;
