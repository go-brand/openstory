import { Link } from "@tanstack/react-router";
import { OpenStoryWindow } from "./openstory-window";

export function Hero() {
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="landing-eyebrow">
          <span aria-hidden="true" />
          Component workbench · Living docs · Agent-ready
        </p>
        <h1 id="hero-title">
          Your components, stories, and docs—running in your <em>real</em> Vite app.
        </h1>
        <p className="hero-description">
          OpenStory discovers the files beside your components and renders them with your CSS,
          providers, and React. No separate docs app. No configuration maze.
        </p>
        <div className="hero-actions">
          <Link
            to="/docs/$"
            params={{ _splat: "installation" }}
            className="landing-button landing-button-primary"
          >
            Get started <span aria-hidden="true">→</span>
          </Link>
          <a
            href="https://github.com/go-brand/openstory"
            className="landing-button landing-button-secondary"
          >
            View on GitHub
          </a>
        </div>
        <p className="hero-note">Open source · Vite 7 and 8 · Desktop download coming soon</p>
      </div>

      <div className="hero-window-wrap">
        <div className="hero-window-caption">
          <span>OpenStory manager</span>
          <span>Rendering your project</span>
        </div>
        <OpenStoryWindow />
      </div>
    </section>
  );
}
