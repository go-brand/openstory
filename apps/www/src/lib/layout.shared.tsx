import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="openstory-wordmark">
          <span className="openstory-wordmark-dot" aria-hidden="true" />
          OpenStory
        </span>
      ),
    },
    githubUrl: "https://github.com/go-brand/openstory",
    links: [
      {
        text: "Documentation",
        url: "/docs",
      },
      {
        text: "Get started",
        url: "/docs/installation",
        active: "nested-url",
      },
    ],
  };
}
