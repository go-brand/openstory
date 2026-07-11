export function RenderVisual() {
  return (
    <div className="agent-visual agent-render-visual" aria-hidden="true">
      <div className="agent-window">
        <div className="agent-window-bar">
          <span />
          <span />
          <span />
          <code>button--primary</code>
        </div>
        <div className="agent-window-canvas">
          <span className="agent-preview-button">Save changes</span>
        </div>
      </div>
      <div className="agent-visual-pills">
        <span>desktop</span>
        <span>dark</span>
      </div>
    </div>
  );
}

export function ChangesVisual() {
  return (
    <div className="agent-visual agent-changes-visual" aria-hidden="true">
      <div className="agent-file-stack">
        <span>
          <i className="agent-status-dot is-changed" /> Button.tsx
        </span>
        <span>
          <i className="agent-status-dot" /> Button.stories.tsx
        </span>
        <span>
          <i className="agent-status-dot" /> forms.stories.md
        </span>
      </div>
      <svg viewBox="0 0 84 72" focusable="false">
        <path d="M2 36h20c18 0 18-25 36-25h24" />
        <path d="M22 36c18 0 18 25 36 25h24" />
      </svg>
      <div className="agent-change-results">
        <span>1 story</span>
        <span>1 doc</span>
      </div>
    </div>
  );
}

export function DocsVisual() {
  return (
    <div className="agent-visual agent-docs-visual" aria-hidden="true">
      <div className="agent-doc-source">
        <span />
        <span />
        <span />
        <code>source</code>
      </div>
      <span className="agent-doc-arrow">→</span>
      <div className="agent-doc-output">
        <span className="agent-skill-chip">skill</span>
        <strong>*.stories.md</strong>
        <span />
        <span />
      </div>
    </div>
  );
}

export function VerifyVisual() {
  return (
    <div className="agent-visual agent-verify-visual" aria-hidden="true">
      <div className="agent-manifest-line">
        <span className="agent-manifest-node is-active" />
        <span />
        <span className="agent-manifest-node is-active" />
        <span />
        <span className="agent-manifest-node is-active" />
      </div>
      <div className="agent-checks">
        <span>
          <i>✓</i> Manifest
        </span>
        <span>
          <i>✓</i> Internal links
        </span>
        <span>
          <i>✓</i> Live embeds
        </span>
      </div>
    </div>
  );
}
