import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        coverage: {
            provider: 'v8', // Specify coverage provider
            reporter: ['text', 'html'],
        },
        setupFiles: ['./vitest-setup.ts'],
    },
});
