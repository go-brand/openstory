import assert from "node:assert/strict";
import test from "node:test";

import { validateManifest } from "./verify-openstory-docs.mjs";

const VALID_MANIFEST = {
  components: [
    {
      id: "button",
      stories: [{ id: "primary" }],
    },
  ],
  docs: [
    {
      id: "billing",
      title: "Billing",
      group: "Features",
      status: "shipped",
      owner: "platform",
      html: '<a href="openstory:page/notifications">Notifications</a>',
      embeds: ["button--primary"],
    },
  ],
};

test("accepts a resolved feature document", () => {
  assert.deepEqual(validateManifest(VALID_MANIFEST, ["billing"]), []);
});

test("reports metadata, dead-link, and embed failures together", () => {
  const manifest = {
    components: VALID_MANIFEST.components,
    docs: [
      {
        id: "billing",
        title: "Billing",
        group: "",
        status: "in-progress",
        owner: "",
        html: '<span class="openstory-doc-deadlink">Missing</span>',
        embeds: ["button--missing"],
      },
    ],
  };

  assert.deepEqual(validateManifest(manifest, ["billing"]), [
    'doc "billing" must declare a non-empty group',
    'doc "billing" has unsupported status "in-progress"',
    'doc "billing" must declare a non-empty owner',
    'doc "billing" contains an unresolved OpenStory link',
    'doc "billing" embeds missing story "button--missing"',
  ]);
});

test("reports an expected document missing from the manifest", () => {
  assert.deepEqual(validateManifest(VALID_MANIFEST, ["notifications"]), [
    'doc "notifications" is not present in the OpenStory manifest',
  ]);
});
