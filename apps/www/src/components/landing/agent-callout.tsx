import { Link } from "@tanstack/react-router";

export function AgentCallout() {
  return (
    <section className="agent-callout" aria-labelledby="agent-title">
      <div>
        <p className="section-kicker">The same stories are legible to agents</p>
        <h2 id="agent-title">Give an agent eyes on the component it is changing.</h2>
      </div>
      <div className="agent-copy">
        <p>
          OpenStory exposes a read-only MCP server and stable render URLs from your Vite process. An
          agent can find changed stories, inspect their source, and verify the real rendered output.
        </p>
        <Link to="/docs/$" params={{ _splat: "" }} className="text-link">
          See how OpenStory works <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="agent-terminal" aria-hidden="true">
        <div className="terminal-bar">
          <span />
          <span />
          <span />
          <code>/__pl__/mcp</code>
        </div>
        <pre>
          <span className="terminal-muted">tool</span> get_changed_stories{`\n`}
          <span className="terminal-blue">Button / Primary</span>
          {`\n`}
          <span className="terminal-muted">render</span> /__pl__/?component=button&story=primary
        </pre>
      </div>
    </section>
  );
}
