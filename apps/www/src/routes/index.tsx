import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { AgentCallout } from "@/components/landing/agent-callout";
import { GettingStarted } from "@/components/landing/getting-started";
import { Hero } from "@/components/landing/hero";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="landing-main">
        <Hero />
        <GettingStarted />
        <AgentCallout />
      </main>
    </HomeLayout>
  );
}
