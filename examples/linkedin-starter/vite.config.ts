import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { openStory } from '@gobrand/openstory-vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), openStory()],
  server: {
    port: 5180,
    strictPort: false,
  },
});
