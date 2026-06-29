import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const target = document.getElementById("root");
if (!target) throw new Error("root not found");

createRoot(target).render(
  <StrictMode>
    <div className="p-8 font-sans">
      <h1 className="text-2xl font-semibold">OpenStory Starter</h1>
      <p className="mt-2 text-neutral-600">
        A minimal design system (Button, Badge) + docs. Open{" "}
        <code className="rounded bg-neutral-100 px-1">/__pl__</code> to view it through the
        OpenStory desktop app.
      </p>
    </div>
  </StrictMode>,
);
