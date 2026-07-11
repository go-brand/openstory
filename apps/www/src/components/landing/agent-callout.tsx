import { Link } from "@tanstack/react-router";
import { ChangesVisual, DocsVisual, RenderVisual, VerifyVisual } from "./agent-visuals";
import { CopyCommand } from "./copy-command";

const skillCommand = "npx skills add go-brand/openstory --skill openstory-feature-docs";

const agentFeatures = [
  {
    title: "See the real component",
    description:
      "Open a stable render URL with the project’s actual CSS, providers, and React—not a simplified replica.",
    visual: <RenderVisual />,
  },
  {
    title: "Find what changed",
    description:
      "Ask the read-only MCP for changed stories and affected docs without rescanning the project.",
    visual: <ChangesVisual />,
  },
  {
    title: "Keep feature docs current",
    description:
      "Install the OpenStory skill to keep *.stories.md source-backed and current at task boundaries.",
    visual: <DocsVisual />,
  },
  {
    title: "Verify the handoff",
    description:
      "Check manifest metadata, internal links, and live embeds before the task is considered done.",
    visual: <VerifyVisual />,
  },
] as const;

export function AgentCallout() {
  return (
    <section className="landing-section agent-section" aria-labelledby="agent-title">
      <div className="landing-container">
        <header className="agent-heading">
          <div>
            <h2 id="agent-title">A real surface for agents to work from.</h2>
          </div>
          <p>
            Render the component, inspect what changed, reconcile the docs, and verify the handoff
            against the same manifest people use.
          </p>
        </header>

        <div className="agent-grid">
          {agentFeatures.map((feature) => (
            <article className="agent-card" key={feature.title}>
              {feature.visual}
              <div className="agent-card-copy">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="agent-skill-row">
          <div>
            <p>Give Codex, Claude Code, and other compatible agents the feature-docs workflow.</p>
          </div>
          <div className="agent-skill-action">
            <CopyCommand command={skillCommand} copyLabel="Copy skill install command" />
            <Link to="/docs/$" params={{ _splat: "agent-skill" }} className="text-link">
              Read the skill guide <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
