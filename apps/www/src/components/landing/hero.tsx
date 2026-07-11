import { Link } from "@tanstack/react-router";
import { CopyCommand } from "./copy-command";

const installCommand = "pnpm add -D @gobrand/openstory-config @gobrand/openstory-vite";

export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="landing-container">
        <h1 id="hero-title">Your components, stories, and docs—running in your real Vite app.</h1>
        <p className="hero-description">
          OpenStory discovers the files beside your components and renders them with your CSS,
          providers, and React. No separate docs app. No configuration maze.
        </p>
        <div className="hero-actions">
          <CopyCommand command={installCommand} copyLabel="Copy install command" />
          <Link to="/docs/$" params={{ _splat: "installation" }} className="text-link">
            Read the docs <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="hero-note">Open source · Vite 7 and 8 · Desktop download coming soon</p>
      </div>
    </section>
  );
}
