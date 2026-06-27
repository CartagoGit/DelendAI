import type { IRulePreset } from '../../contracts';

/**
 * C (clang-tidy) preset.
 */
export const C_PRESET: IRulePreset = {
	id: 'c-clang-tidy',
	framework: 'c',
	language: 'c',
	linter: 'clang-tidy',
	linterConfigFile: 'c-clang-tidy.config.c',
	linterConfigContent: `# Default clang-tidy configuration for C\n`,
	eslintConfigFile: 'c-clang-tidy.config.c',
	eslintConfigContent: `# Default clang-tidy configuration for C\n`,
	conventions: [
		'Follow standard C coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['clang-tidy'],
};

/**
 * C++ (clang-tidy) preset.
 */
export const CPP_PRESET: IRulePreset = {
	id: 'cpp-clang-tidy',
	framework: 'cpp',
	language: 'cpp',
	linter: 'clang-tidy',
	linterConfigFile: 'cpp-clang-tidy.config.cpp',
	linterConfigContent: `# Default clang-tidy configuration for C++\n`,
	eslintConfigFile: 'cpp-clang-tidy.config.cpp',
	eslintConfigContent: `# Default clang-tidy configuration for C++\n`,
	conventions: [
		'Follow standard C++ coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['clang-tidy'],
};

/**
 * Objective-C (clang-tidy) preset.
 */
export const OBJC_PRESET: IRulePreset = {
	id: 'objc-clang-tidy',
	framework: 'objc',
	language: 'objc',
	linter: 'clang-tidy',
	linterConfigFile: 'objc-clang-tidy.config.m',
	linterConfigContent: `# Default clang-tidy configuration for Objective-C\n`,
	eslintConfigFile: 'objc-clang-tidy.config.m',
	eslintConfigContent: `# Default clang-tidy configuration for Objective-C\n`,
	conventions: [
		'Follow standard Objective-C coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['clang-tidy'],
};

/**
 * Objective-C++ (clang-tidy) preset.
 */
export const OBJCPP_PRESET: IRulePreset = {
	id: 'objcpp-clang-tidy',
	framework: 'objcpp',
	language: 'objcpp',
	linter: 'clang-tidy',
	linterConfigFile: 'objcpp-clang-tidy.config.mm',
	linterConfigContent: `# Default clang-tidy configuration for Objective-C++\n`,
	eslintConfigFile: 'objcpp-clang-tidy.config.mm',
	eslintConfigContent: `# Default clang-tidy configuration for Objective-C++\n`,
	conventions: [
		'Follow standard Objective-C++ coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['clang-tidy'],
};

/**
 * Carbon (clang-tidy) preset.
 */
export const CARBON_PRESET: IRulePreset = {
	id: 'carbon-clang-tidy',
	framework: 'carbon',
	language: 'carbon',
	linter: 'clang-tidy',
	linterConfigFile: 'carbon-clang-tidy.config.carbon',
	linterConfigContent: `# Default clang-tidy configuration for Carbon\n`,
	eslintConfigFile: 'carbon-clang-tidy.config.carbon',
	eslintConfigContent: `# Default clang-tidy configuration for Carbon\n`,
	conventions: [
		'Follow standard Carbon coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['clang-tidy'],
};
