"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FixtureCard({ label }: { label: string }) {
  const pathname = usePathname();
  return (
    <article className="fixture-card" data-testid="fixture-card">
      <Image
        alt="OpenStory mark"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='24' height='24' fill='%237c3aed'/%3E%3C/svg%3E"
        width={24}
        height={24}
        unoptimized
      />
      <strong>{label}</strong>
      <span data-testid="pathname">{pathname}</span>
      <Link href="/__pl__/?component=fixture-card&story=primary">Preview link</Link>
    </article>
  );
}
