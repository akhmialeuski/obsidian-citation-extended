import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-plugin-prettier';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

// Product and format names that legitimately keep their casing in UI text, so
// obsidianmd/ui/sentence-case accepts them without an eslint-disable (a setting
// label may say "Better BibTeX" or "Zotero" without violating sentence case).
const UI_BRAND_NAMES = [
    'Obsidian',
    'Zotero',
    'Better BibTeX',
    'BibTeX',
    'BibLaTeX',
    'CSL JSON',
    'Readwise',
    'Mendeley',
    'Hayagriva',
    'Kindle',
    'Instapaper',
    'Reader',
];

// All-caps acronyms that are correct as-is in UI text.
const UI_ACRONYMS = [
    'API',
    'URL',
    'URI',
    'PDF',
    'HTTP',
    'HTTPS',
    'JSON',
    'CSL',
    'ID',
    'YAML',
    'UI',
    'BBT',
    'ISBN',
    'ASIN',
    'DOI',
];

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            prettier,
            obsidianmd,
            '@eslint-community/eslint-comments': eslintComments,
        },
        linterOptions: {
            // A stale eslint-disable that no longer suppresses anything is itself
            // an error, so suppressions cannot silently rot.
            reportUnusedDisableDirectives: 'error',
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
            'obsidianmd/no-global-this': 'error', // prefer window/activeWindow (see core override)
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
            // UI text must be sentence case; product names and acronyms are
            // allow-listed and literal URLs are ignored, so legitimate strings
            // pass without an eslint-disable.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: UI_BRAND_NAMES,
                    acronyms: UI_ACRONYMS,
                    ignoreRegex: ['https?://\\S+'],
                },
            ],

            // Guideline rules must not be silenced with an inline eslint-disable,
            // and any directive that remains has to explain itself. This mirrors
            // the Obsidian review bot so such issues are caught locally by
            // `npm run lint` instead of only in review.
            '@eslint-community/eslint-comments/no-restricted-disable': [
                'error',
                'obsidianmd',
            ],
            '@eslint-community/eslint-comments/require-description': [
                'error',
                { ignore: [] },
            ],

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
            '**/*.config.cjs',
            'docs/assets/**',
            '.agent/**',
            '.claude/**',
            'eslint.config.mjs',
            'version-bump.mjs',
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
            // Obsidian runtime guidelines don't apply to Node-based test code,
            // which legitimately stubs `global`/`globalThis` for mocking.
            'obsidianmd/prefer-window-timers': 'off',
            'obsidianmd/no-global-this': 'off',
            // Mock fixtures use arbitrary titles, not user-facing UI text.
            'obsidianmd/ui/sentence-case': 'off',
            // Test files silence no-explicit-any for mocks with bare directives;
            // they are not shipped and not covered by the review guidelines.
            '@eslint-community/eslint-comments/require-description': 'off',
            '@eslint-community/eslint-comments/no-restricted-disable': 'off',
        },
    },
);
