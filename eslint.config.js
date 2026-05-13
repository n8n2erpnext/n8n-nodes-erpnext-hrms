const eslint = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
	eslint.configs.recommended,
	{
		files: ['*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				exports: 'writable',
				module: 'writable',
				require: 'readonly',
			},
		},
	},
	{
		files: ['credentials/**/*.ts', 'nodes/**/*.ts', 'index.ts'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
