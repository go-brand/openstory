const steps = [
  {
    number: "01",
    label: "vite.config.ts",
    title: "Add the Vite plugin",
    description: "One plugin serves the preview harness and discovers every story and docs file.",
  },
  {
    number: "02",
    label: "Button.stories.tsx",
    title: "Write a colocated story",
    description: "Define meaningful component states beside the component that owns them.",
  },
  {
    number: "03",
    label: "OpenStory",
    title: "Open the project",
    description: "Choose the folder. Your design system and docs appear in the desktop workbench.",
  },
] as const;

export function GettingStarted() {
  return (
    <section className="landing-section" aria-labelledby="getting-started-title">
      <div className="landing-container">
        <header className="section-heading">
          <p className="section-kicker">How it works</p>
          <h2 id="getting-started-title">Your project stays your project.</h2>
          <p>
            OpenStory runs beside your app and renders through its existing Vite setup. Three steps
            take you from repository to component workbench.
          </p>
        </header>

        <ol className="workflow-list">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="step-number">{step.number}</span>
              <code>{step.label}</code>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
