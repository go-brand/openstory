import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SUPPORTED_STATUSES = new Set(["shipped", "beta", "planned"]);

export function validateManifest(manifest, expectedDocIds = []) {
  if (!manifest || !Array.isArray(manifest.docs)) {
    return ["OpenStory manifest must contain a docs array"];
  }

  const components = Array.isArray(manifest.components) ? manifest.components : [];
  const storyKeys = new Set(
    components.flatMap((component) =>
      Array.isArray(component?.stories)
        ? component.stories.map((story) => `${component.id}--${story.id}`)
        : [],
    ),
  );
  const docsById = new Map();
  const errors = [];

  for (const doc of manifest.docs) {
    if (docsById.has(doc?.id)) errors.push(`duplicate doc id "${doc.id}"`);
    else docsById.set(doc?.id, doc);
  }

  const docs = [];
  if (expectedDocIds.length > 0) {
    for (const id of expectedDocIds) {
      const doc = docsById.get(id);
      if (doc) docs.push(doc);
      else errors.push(`doc "${id}" is not present in the OpenStory manifest`);
    }
  } else {
    docs.push(...manifest.docs);
  }

  for (const doc of docs) {
    const label = `doc "${doc.id}"`;
    if (typeof doc.title !== "string" || doc.title.trim() === "") {
      errors.push(`${label} must declare a non-empty title`);
    }
    if (typeof doc.group !== "string" || doc.group.trim() === "") {
      errors.push(`${label} must declare a non-empty group`);
    }
    if (!SUPPORTED_STATUSES.has(doc.status)) {
      errors.push(`${label} has unsupported status "${String(doc.status)}"`);
    }
    if (typeof doc.owner !== "string" || doc.owner.trim() === "") {
      errors.push(`${label} must declare a non-empty owner`);
    }
    if (typeof doc.html === "string" && doc.html.includes("openstory-doc-deadlink")) {
      errors.push(`${label} contains an unresolved OpenStory link`);
    }
    for (const embed of Array.isArray(doc.embeds) ? doc.embeds : []) {
      if (!storyKeys.has(embed)) errors.push(`${label} embeds missing story "${embed}"`);
    }
  }

  return errors;
}

async function loadManifest(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`failed to fetch ${source}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  return JSON.parse(await readFile(source, "utf8"));
}

async function main() {
  const [source, ...docIds] = process.argv.slice(2);
  if (!source) {
    console.error("Usage: node verify-openstory-docs.mjs <manifest-file-or-url> [doc-id ...]");
    process.exitCode = 2;
    return;
  }

  const errors = validateManifest(await loadManifest(source), docIds);
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const scope = docIds.length > 0 ? docIds.join(", ") : "all docs";
  console.log(`OpenStory docs verified: ${scope}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
