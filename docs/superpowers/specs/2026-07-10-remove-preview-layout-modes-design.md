# Remove Preview Layout Modes

## Goal

Remove the selectable `padded`, `centered`, and `fullscreen` preview-layout feature from OpenStory end to end. The result has one story-preview presentation rather than a configurable layout contract.

`previewPadding` is explicitly retained. It solves a separate problem: component- or story-specific overflow such as shadows, menus, badges, and other visual content that extends slightly beyond the component box.

## Resulting behavior

- A selected story is rendered in the existing measured, shrink-wrapped stage.
- The desktop manager sizes the iframe from the runtime's `pl:size` report and places it at the top-center of the canvas with its normal outer breathing room.
- Component- and story-level `previewPadding` remains on the measured wrapper and contributes to the reported size.
- Documentation and feature-doc pages continue to fill the canvas.
- There is no layout selector and no configuration, manifest, selection, IPC, bridge, URL, or MCP layout override.

## Contract removal

Remove the layout concept from:

- public config types and component definitions;
- generated and cached manifest component data;
- desktop main-process and renderer selection state;
- preview IPC and runtime bridge messages;
- headless preview URL parsing and MCP render inputs/URLs;
- runtime story and documentation rendering branches;
- toolbar controls, tests, fixtures, examples, and current user-facing documentation.

Historical planning and specification documents remain historical records and do not define the current API. References in active README/API documentation must be updated.

## `previewPadding` boundary

Keep `PreviewPadding` and its component/story fields in config, manifests, runtime rendering, serialization, and tests. Padding remains sanitized to finite non-negative values and is applied outside the component render while remaining inside the measured preview wrapper.

Removing layout must not remove or weaken `previewPadding` propagation from configuration through the Vite manifest into the runtime.

## Compatibility

This is a clean removal, not a deprecation. Existing `layout` configuration and `layout=` URL or MCP inputs cease to be supported. No ignored compatibility field or hidden layout override remains.

## Verification

- Add or revise focused tests first so they describe the single-layout contract and continued `previewPadding` behavior.
- Verify layout fields and handlers are absent from active source and current documentation.
- Run the affected package tests while iterating.
- Finish with repository typecheck, tests, lint, and build.
