const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...compat.extends('next/core-web-vitals', 'prettier'),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]

module.exports = config
