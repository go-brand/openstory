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
  // After the HTML mounts, collect each placeholder node so we can portal into it.
  const [targets, setTargets] = useState<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const map = new Map<string, HTMLElement>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-openstory-story]")) {
      const id = el.getAttribute("data-openstory-story");
      if (id) map.set(id, el);
    }
    setTargets(map);
  }, [html]);

  return (
    <>
      {/* doc HTML comes from a project-local file the developer already trusts
          (same boundary as their own source) — not user-submitted content. */}
      <div ref={rootRef} className="openstory-doc" dangerouslySetInnerHTML={{ __html: html }} />
      {embeds.map((id) => {
        const target = targets.get(id);
        if (!target) return null;
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
          target,
          id,
        );
      })}
    </>
  );
}
