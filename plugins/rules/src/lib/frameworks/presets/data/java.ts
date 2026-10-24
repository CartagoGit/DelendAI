import type { IRulePreset } from '../../contracts';

/**
 * Java (Checkstyle) preset — DATA only.
 *
 * Single Responsibility: the baseline `checkstyle.xml` + bullets for
 * Java. The project's own `checkstyle.xml` layers on top and wins;
 * the Gradle `compileJava` task is the typecheck.
 */
export const JAVA_PRESET: IRulePreset = {
	id: 'java-checkstyle',
	framework: 'java',
	language: 'java',
	linter: 'checkstyle',
	linterConfigFile: 'java-checkstyle.checkstyle.xml',
	linterConfigContent: `<?xml version="1.0"?>
<!-- Baseline Checkstyle config (the project's own checkstyle.xml wins). -->
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
  "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="TreeWalker">
    <module name="UnusedImports"/>
    <module name="EmptyBlock"/>
  </module>
</module>
`,
	conventions: [
		'PascalCase for classes, camelCase for methods/fields, UPPER_SNAKE for constants.',
		'Favour immutability: `final` fields, `record` value carriers, defensive copies.',
		'Prefer composition over inheritance; program to interfaces.',
		'Run Checkstyle (or Spotless) in the build before merge.',
	],
	requiredLinterDeps: ['checkstyle'],
};
