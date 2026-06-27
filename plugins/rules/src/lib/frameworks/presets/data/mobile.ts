import type { IRulePreset } from '../../contracts';

/**
 * Dart (dart-analyze) preset.
 */
export const DART_PRESET: IRulePreset = {
	id: 'dart-dart-analyze',
	framework: 'dart',
	language: 'dart',
	linter: 'dart-analyze',
	linterConfigFile: 'dart-dart-analyze.config.dart',
	linterConfigContent: `# Default dart-analyze configuration for Dart\n`,
	conventions: [
		'Follow standard Dart coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['dart-analyze'],
};
