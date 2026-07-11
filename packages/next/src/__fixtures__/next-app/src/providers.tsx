"use client";

import type { ReactNode } from "react";

export function FixtureProvider({ children }: { children: ReactNode }) {
  return <div data-testid="fixture-provider">{children}</div>;
}
