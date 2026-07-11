# @gobrand/openstory-vite

Vite plugin that serves the OpenStory preview harness for a project.

Part of [OpenStory](https://github.com/go-brand/openstory).

```ts
import react from "@vitejs/plugin-react";
import { openStory } from "@gobrand/openstory-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), openStory()],
});
```

Place `openStory()` before framework and runtime adapters. In `openstory` mode,
it automatically isolates the preview harness from supported pipeline owners,
including TanStack Start and `@cloudflare/vite-plugin`. Normal Vite modes are
unchanged.

Unknown plugins remain enabled. If an unsupported adapter conflicts, disable
its exact Vite plugin name explicitly:

```ts
openStory({
  compatibility: {
    disable: ["my-runtime:dev-server"],
    keep: ["my-runtime:diagnostics"],
  },
});
```

`keep` takes precedence over built-in and custom disabling.
