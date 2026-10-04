import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

/**
 * Lint rules for the app.
 *
 * The aim is to catch real mistakes — an undefined variable, a duplicate key, a
 * template that reads something that does not exist — not to argue about style.
 * Formatting is Prettier's job (see .prettierrc), and is not enforced in CI yet:
 * the code base was not written to it, and reformatting every file would bury
 * the history.
 */
export default [
    { ignores: ['dist/**', '../docs/**', 'public/**', 'node_modules/**', 'scripts/**'] },

    js.configs.recommended,
    ...pluginVue.configs['flat/essential'],

    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser }
        },
        rules: {
            // Unused things are worth knowing about, but not worth failing a build.
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
            // `catch {}` that deliberately swallows is used on purpose in places.
            'no-empty': ['error', { allowEmptyCatch: true }],
            // Components are single-word views and screens by design.
            'vue/multi-word-component-names': 'off',
            // A template that reads something its script never defines renders nothing
            // there and only warns at runtime — exactly what a refactor can leave behind.
            'vue/no-undef-properties': 'error',
            // <router-link>/<router-view> are registered globally by vue-router.
            'vue/no-undef-components': ['error', { ignorePatterns: ['router-link', 'router-view', 'RouterLink', 'RouterView'] }]
        }
    },

    {
        files: ['**/*.test.js', 'src/test/**'],
        languageOptions: { globals: { ...globals.node } }
    },

    {
        files: ['*.config.js', 'scripts/**', '*.mjs'],
        languageOptions: { globals: { ...globals.node } }
    }
];
