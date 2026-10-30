import js from '@eslint/js';
import type {Linter} from 'eslint';
import {defineConfig} from 'eslint/config';
import oxlint from 'eslint-plugin-oxlint';
import tseslint from 'typescript-eslint';

const style: Linter.RulesRecord = {
    'camelcase': ['error', {properties: 'never', allow: ['^vfunc_', '^on_']}],
    'curly': ['error', 'all'],
    'eqeqeq': 'error',
    'no-console': 'off',
    'no-var': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
};

export default defineConfig(
    {ignores: ['node_modules/', 'dist/', 'build/', 'types/']},
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            ...style,
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/strict-boolean-expressions': [
                'error',
                {
                    allowString: true,
                    allowNumber: true,
                    allowNullableObject: true,
                },
            ],
            '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true}],
            '@typescript-eslint/dot-notation': ['error', {allowIndexSignaturePropertyAccess: true}],
        },
    },
    {
        files: ['test/**/*.test.ts'],
        rules: {'@typescript-eslint/no-floating-promises': 'off'},
    },
    oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
