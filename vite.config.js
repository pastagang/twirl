import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        strudel: 'panels/strudel.html',
        hydra: 'panels/hydra.html',
        shader: 'panels/shader.html',
        kabelsalat: 'panels/kabelsalat.html',
      },
    },
  },
});
