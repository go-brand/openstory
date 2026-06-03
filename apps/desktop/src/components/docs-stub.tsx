import { HugeiconsIcon, File01Icon } from "../lib/icons";

export function DocsStub({ componentName }: { componentName: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-amber-500">
          <HugeiconsIcon icon={File01Icon} className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-foreground">{componentName} · Documentation</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            The docs view arrives in area 6. For now, pick a story in the sidebar to render it on
            the canvas.
          </p>
        </div>
      </div>
    </div>
  );
}
