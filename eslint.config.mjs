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
            // Prettier integration
            'prettier/prettier': 'error',

            // Unused variables: allow _-prefixed params (abstract method implementations)
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

            // Strict type safety
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/no-unsafe-function-type': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/unbound-method': 'error',

            // Catch "Unsafe ... of an `any` value" — the type-safety warnings flagged
            // by the Obsidian plugin review (require parserOptions.project, set above).
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',

            // Console usage
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],

            // Obsidian plugin guideline rules (eslint-plugin-obsidianmd).
            // Listed individually instead of spreading `configs.recommended`,
            // whose 0.3.0 bundle also pulls in eslint-plugin-security / -sdl /
            // -import / -no-unsanitized, which flood this codebase with
            // unrelated findings.
            'obsidianmd/no-unsupported-api': 'error', // API calls newer than manifest.minAppVersion
            'obsidianmd/prefer-window-timers': 'error', // window.setTimeout over bare global timers
            'obsidianmd/no-tfile-tfolder-cast': 'error',
            'obsidianmd/no-view-references-in-plugin': 'error',
            'obsidianmd/object-assign': 'error',
            'obsidianmd/platform': 'error',
            'obsidianmd/prefer-abstract-input-suggest': 'error',
            'obsidianmd/regex-lookbehind': 'error',
            'obsidianmd/vault/iterate': 'error',
            'obsidianmd/detach-leaves': 'error',
            'obsidianmd/commands/no-command-in-command-id': 'error',
            'obsidianmd/commands/no-command-in-command-name': 'error',
            'obsidianmd/commands/no-default-hotkeys': 'error',
            'obsidianmd/commands/no-plugin-id-in-command-id': 'error',
            'obsidianmd/commands/no-plugin-name-in-command-name': 'error',
            'obsidianmd/settings-tab/no-manual-html-headings': 'warn',
            'obsidianmd/settings-tab/no-problematic-settings-headings': 'warn',
            'obsidianmd/ui/sentence-case': 'warn',

            // Prefer Obsidian's createDiv()/createSpan() shorthand over
            // createEl('div'|'span'). 0.3.0 ships the rule logic but does not
            // export it, so the check is reproduced here.
            'no-restricted-syntax': [
                'warn',
                {
                    selector:
                        "CallExpression[callee.property.name='createEl'][arguments.0.value=/^(div|span)$/]",
                    message:
                        "Prefer createDiv()/createSpan() over createEl('div'|'span') for Obsidian element creation.",
                },
            ],
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
            '.claude/**',
            'eslint.config.mjs',
        ],
    },
    {
        // Test code (specs + shared mocks/helpers). Jest mocks and the mock
        // platform/obsidian adapters are intentionally `any`-typed, so the
        // type-checked safety rules — which only matter for shipped src/ code —
        // are relaxed here.
        files: ['tests/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            'no-restricted-syntax': 'off',
            // Obsidian runtime guidelines don't apply to jsdom test code.
            'obsidianmd/prefer-window-timers': 'off',
            // Mock fixtures use arbitrary titles, not user-facing UI text.
            'obsidianmd/ui/sentence-case': 'off',
        },
    },
);
