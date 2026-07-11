import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="not-found">
      <p className="not-found-label">404 / No story here</p>
      <h1>This page could not be found.</h1>
      <p>The component tree is intact. This route just is not part of it.</p>
      <Link to="/" className="landing-button landing-button-primary">
        Back to OpenStory
      </Link>
    </main>
  );
}
