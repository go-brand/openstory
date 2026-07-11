import { Link } from "@tanstack/react-router";

export function AgentCallout() {
  return (
    <section className="landing-section agent-section" aria-labelledby="agent-title">
      <div className="landing-container agent-content">
        <div>
          <p className="section-kicker">For agents</p>
          <h2 id="agent-title">Give an agent eyes on the component it is changing.</h2>
        </div>
        <div>
          <p>
            OpenStory exposes a read-only MCP server and stable render URLs from your Vite process.
            An agent can find changed stories, inspect their source, and verify the real rendered
            output.
          </p>
          <Link to="/docs/$" params={{ _splat: "" }} className="text-link">
            See how OpenStory works <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
