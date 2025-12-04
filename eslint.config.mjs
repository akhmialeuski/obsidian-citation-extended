import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            prettier,
            obsidianmd,
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        rules: {
            // Obsidian Plugin Rules (Recommended)
            ...obsidianmd.configs.recommended,

            // Prettier integration
            'prettier/prettier': 'error',

            // Strict Type Safety
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/no-unsafe-function-type': 'off', // Allowed for event callbacks

            // Console usage
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],

            // Obsidian Plugin Rules
            'obsidianmd/ui/sentence-case': 'warn',
        },
    },
    eslintConfigPrettier,

    {
        ignores: [
            'dist/**',
            'coverage/**',
            'node_modules/**',
            '**/*.config.mjs',
            'docs/assets/**',
            '.agent/**',
            'eslint.config.mjs',
        ],
    },
);
