import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'

export default [
    // 全局忽略
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021
            }
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': ts,
            'sonarjs': sonarjs
        },
        rules: {
            ...ts.configs.recommended.rules,
            ...sonarjs.configs.recommended.rules,
            'complexity': ['error', 10],
            'sonarjs/cognitive-complexity': ['error', 15],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error'
        }
    },
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
                ecmaVersion: 'latest',
                sourceType: 'module',
                extraFileExtensions: ['.vue']
            }
        },
        plugins: {
            '@typescript-eslint': ts,
            'sonarjs': sonarjs
        },
        rules: {
            ...ts.configs.recommended.rules,
            ...sonarjs.configs.recommended.rules,
            'complexity': ['error', 10],
            'sonarjs/cognitive-complexity': ['error', 15],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'vue/multi-word-component-names': 'off',
            'no-undef': 'off' // Vue 模板中的全局变量可能报错，交由 vue-tsc 处理
        }
    },
    // Preview.vue 使用 v-html 渲染 markdown 内容，这是预期行为
    {
        files: ['**/Preview.vue'],
        rules: {
            'vue/no-v-html': 'off'
        }
    },
    {
        files: ['**/*.test.ts', 'tests/setup.ts'],
        languageOptions: {
            globals: {
                ...globals.vitest
            }
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off'
        }
    }
]
