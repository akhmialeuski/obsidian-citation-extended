import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-plugin-prettier';
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
    // The base Obsidian's community plugin scanner builds on, so a rule the scanner runs is run here first.
    ...obsidianmd.configs.recommended,
    {
        files: ['**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}'],
        plugins: {
            prettier,
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
        },
    },
    eslintConfigPrettier,

    {
        // crap-gate limits, kept equal to crap-gate.toml so the edit hook and the commit agree.
        // Existing debt is recorded per file in .eslint/suppressions.json and may only shrink. The file is
        // kept off ESLint's default location so a run under another config, such as Obsidian's plugin
        // scanner, does not read it, find its entries unused and exit with a fatal error.
        files: ['src/**/*.ts'],
        rules: {
            complexity: ['error', 8],
            'max-params': ['error', 5],
            'max-lines': [
                'error',
                { max: 500, skipComments: true, skipBlankLines: true },
            ],
            'max-lines-per-function': [
                'error',
                { max: 50, skipComments: true, skipBlankLines: true },
            ],
        },
    },

    {
        // Node scripts lie outside tsconfig.json, so they are linted without type information.
        files: ['tools/**/*.mjs'],
        ...tseslint.configs.disableTypeChecked,
        rules: {
            ...tseslint.configs.disableTypeChecked.rules,
            // Obsidian plugin rules that need type information, which a Node script neither has nor needs.
            'obsidianmd/no-unsupported-api': 'off',
            'obsidianmd/no-view-references-in-plugin': 'off',
        },
    },

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
            // Obsidian runtime guidelines don't apply to Node-based test code,
            // which legitimately stubs `global`/`globalThis` for mocking.
            'obsidianmd/prefer-window-timers': 'off',
            'obsidianmd/no-global-this': 'off',
            // Mock fixtures use arbitrary titles, not user-facing UI text.
            'obsidianmd/ui/sentence-case': 'off',
            // Test files silence no-explicit-any for mocks with bare directives;
            // they are not shipped and the plugin scanner does not lint them.
            'eslint-comments/require-description': 'off',
            'eslint-comments/no-restricted-disable': 'off',
            'eslint-comments/disable-enable-pair': 'off',
            // Tests still cover deprecated aliases, such as the Readwise `highlights` variable, until they are removed.
            '@typescript-eslint/no-deprecated': 'off',
        },
    },
);
