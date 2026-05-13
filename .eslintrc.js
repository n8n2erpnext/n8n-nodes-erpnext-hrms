module.exports = {
	root: true,
	env: {
		es2022: true,
		node: true,
	},
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
	},
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	ignorePatterns: ['dist/', 'node_modules/'],
	rules: {
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		'@typescript-eslint/no-explicit-any': 'off',
	},
};
