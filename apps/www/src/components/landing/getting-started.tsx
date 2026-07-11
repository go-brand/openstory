const steps = [
  {
    number: "01",
    label: "vite.config.ts",
    title: "Add the Vite plugin.",
    description: "One plugin serves the preview harness and discovers every story and docs file.",
    code: "openStory()",
  },
  {
    number: "02",
    label: "Button.stories.tsx",
    title: "Write a colocated story.",
    description: "Define meaningful component states beside the component that owns them.",
    code: "defineStories({ … })",
  },
  {
    number: "03",
    label: "OpenStory",
    title: "Open the project.",
    description: "Choose the folder. Your design system and docs appear in the desktop workbench.",
    code: "Design System / Button",
  },
] as const;

export function GettingStarted() {
  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <header className="section-heading">
        <p className="section-kicker">From repo to rendered component</p>
        <h2 id="getting-started-title">Three steps. Your project stays your project.</h2>
        <p>
          OpenStory does not rebuild your design system somewhere else. It gives your existing Vite
          app a focused way to expose it.
        </p>
      </header>

      <ol className="steps-list">
        {steps.map((step) => (
          <li key={step.number}>
            <div className="step-meta">
              <span className="step-number">{step.number}</span>
              <code>{step.label}</code>
            </div>
            <div className="step-copy">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
            <code className="step-code">{step.code}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
