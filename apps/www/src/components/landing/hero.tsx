import { Link } from "@tanstack/react-router";

const installCommand = "pnpm add -D @gobrand/openstory-config @gobrand/openstory-vite";

async function copyInstallCommand() {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(installCommand);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = installCommand;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

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
          <code className="install-command">
            <span aria-hidden="true">$</span>
            <span>{installCommand}</span>
            <button
              type="button"
              onClick={() => void copyInstallCommand()}
              aria-label="Copy install command"
            >
              Copy
            </button>
          </code>
          <Link to="/docs/$" params={{ _splat: "installation" }} className="text-link">
            Read the docs <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="hero-note">Open source · Vite 7 and 8 · Desktop download coming soon</p>
      </div>
    </section>
  );
}
