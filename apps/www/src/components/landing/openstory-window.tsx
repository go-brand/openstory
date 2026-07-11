const storyRows = [
  { label: "Docs", kind: "section" },
  { label: "Getting started", kind: "page" },
  { label: "Design System", kind: "section" },
  { label: "Button", kind: "component" },
  { label: "Primary", kind: "active" },
  { label: "Disabled", kind: "story" },
] as const;

export function OpenStoryWindow() {
  return (
    <div className="product-window" aria-hidden="true">
      <div className="product-titlebar">
        <div className="traffic-lights">
          <span />
          <span />
          <span />
        </div>
        <div className="product-project">
          <span className="product-brand-dot" />
          openstory · app
        </div>
        <span className="product-shortcut">⌘ K</span>
      </div>

      <div className="product-workspace">
        <aside className="product-sidebar">
          <p className="product-sidebar-label">Workspace</p>
          <div className="product-tree">
            {storyRows.map((row) => (
              <div className={`product-tree-row product-tree-${row.kind}`} key={row.label}>
                <span className="product-tree-icon" />
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="product-main">
          <div className="product-toolbar">
            <span className="toolbar-pill toolbar-pill-active">Desktop</span>
            <span className="toolbar-pill">Mobile</span>
            <span className="toolbar-divider" />
            <span>Light</span>
            <span className="toolbar-spacer" />
            <span>100%</span>
          </div>
          <div className="product-canvas">
            <div className="preview-label">Button / Primary</div>
            <div className="preview-card">
              <p>Changes are ready to publish.</p>
              <button type="button" tabIndex={-1}>
                Save changes
              </button>
            </div>
            <div className="canvas-size">720 × 320</div>
          </div>
        </div>

        <aside className="product-controls">
          <div className="controls-tabs">
            <span className="controls-tab-active">Controls</span>
            <span>Actions</span>
          </div>
          <label>
            <span>variant</span>
            <span className="fake-control">primary</span>
          </label>
          <label>
            <span>disabled</span>
            <span className="fake-switch">
              <span />
            </span>
          </label>
          <label>
            <span>children</span>
            <span className="fake-control">Save changes</span>
          </label>
        </aside>
      </div>
    </div>
  );
}
