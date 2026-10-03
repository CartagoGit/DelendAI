import type { IDogmaAdapter } from '../contracts';

/**
 * Java dogma (Java 21 LTS).
 *
 * Single Responsibility: the one place that declares idiomatic Java.
 */
export const JAVA_DOGMA: IDogmaAdapter = {
	language: 'java',
	displayName: 'Java',
	version: 'java-21',
	packageManager: 'gradle',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'null',
	naming: 'PascalCase',
	async: 'futures',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'PascalCase for classes, camelCase for methods/fields, UPPER_SNAKE for constants.',
		'Favour immutability: `final` fields, `record` for value carriers, defensive copies of mutable inputs.',
		'Prefer composition over inheritance; program to interfaces, not implementations.',
		'Use checked exceptions deliberately; never swallow exceptions with an empty `catch`.',
		'Use the Streams API and `Optional<T>` over null returns and manual loops where it reads clearly.',
		'Write JUnit 5 tests (`@Test`); enforce style with Checkstyle/Spotless in the build.',
	],
};
