import type { IRulePreset } from '../../contracts';

/**
 * CMake (hadolint) preset.
 */
export const CMAKE_PRESET: IRulePreset = {
	id: 'cmake-hadolint',
	framework: 'cmake',
	language: 'cmake',
	linter: 'hadolint',
	linterConfigFile: 'cmake-hadolint.config.txt',
	linterConfigContent: `# Default hadolint configuration for CMake\n`,
	eslintConfigFile: 'cmake-hadolint.config.txt',
	eslintConfigContent: `# Default hadolint configuration for CMake\n`,
	conventions: [
		'Follow standard CMake coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};

/**
 * Make (hadolint) preset.
 */
export const MAKE_PRESET: IRulePreset = {
	id: 'make-hadolint',
	framework: 'make',
	language: 'make',
	linter: 'hadolint',
	linterConfigFile: 'make-hadolint.config.mk',
	linterConfigContent: `# Default hadolint configuration for Make\n`,
	eslintConfigFile: 'make-hadolint.config.mk',
	eslintConfigContent: `# Default hadolint configuration for Make\n`,
	conventions: [
		'Follow standard Make coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};

/**
 * Bazel (hadolint) preset.
 */
export const BAZEL_PRESET: IRulePreset = {
	id: 'bazel-hadolint',
	framework: 'bazel',
	language: 'bazel',
	linter: 'hadolint',
	linterConfigFile: 'bazel-hadolint.config.bazel',
	linterConfigContent: `# Default hadolint configuration for Bazel\n`,
	eslintConfigFile: 'bazel-hadolint.config.bazel',
	eslintConfigContent: `# Default hadolint configuration for Bazel\n`,
	conventions: [
		'Follow standard Bazel coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};

/**
 * Starlark (hadolint) preset.
 */
export const BZL_PRESET: IRulePreset = {
	id: 'bzl-hadolint',
	framework: 'bzl',
	language: 'bzl',
	linter: 'hadolint',
	linterConfigFile: 'bzl-hadolint.config.bzl',
	linterConfigContent: `# Default hadolint configuration for Starlark\n`,
	eslintConfigFile: 'bzl-hadolint.config.bzl',
	eslintConfigContent: `# Default hadolint configuration for Starlark\n`,
	conventions: [
		'Follow standard Starlark coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};

/**
 * Justfile (hadolint) preset.
 */
export const JUST_PRESET: IRulePreset = {
	id: 'just-hadolint',
	framework: 'just',
	language: 'just',
	linter: 'hadolint',
	linterConfigFile: 'just-hadolint.config.just',
	linterConfigContent: `# Default hadolint configuration for Justfile\n`,
	eslintConfigFile: 'just-hadolint.config.just',
	eslintConfigContent: `# Default hadolint configuration for Justfile\n`,
	conventions: [
		'Follow standard Justfile coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};

/**
 * Ninja (hadolint) preset.
 */
export const NINJA_PRESET: IRulePreset = {
	id: 'ninja-hadolint',
	framework: 'ninja',
	language: 'ninja',
	linter: 'hadolint',
	linterConfigFile: 'ninja-hadolint.config.ninja',
	linterConfigContent: `# Default hadolint configuration for Ninja\n`,
	eslintConfigFile: 'ninja-hadolint.config.ninja',
	eslintConfigContent: `# Default hadolint configuration for Ninja\n`,
	conventions: [
		'Follow standard Ninja coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['hadolint'],
};
