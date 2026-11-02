import type { IRulePreset } from '../../contracts';

/**
 * Protobuf (buf) preset.
 */
export const PROTO_PRESET: IRulePreset = {
	id: 'proto-buf',
	framework: 'proto',
	language: 'proto',
	linter: 'buf',
	linterConfigFile: 'proto-buf.config.proto',
	linterConfigContent: `# Default buf configuration for Protobuf\n`,
	eslintConfigFile: 'proto-buf.config.proto',
	eslintConfigContent: `# Default buf configuration for Protobuf\n`,
	conventions: [
		'Follow standard Protobuf coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['buf'],
};

/**
 * GraphQL (prettier) preset.
 */
export const GRAPHQL_PRESET: IRulePreset = {
	id: 'graphql-prettier',
	framework: 'graphql',
	language: 'graphql',
	linter: 'prettier',
	linterConfigFile: 'graphql-prettier.config.graphql',
	linterConfigContent: `# Default prettier configuration for GraphQL\n`,
	eslintConfigFile: 'graphql-prettier.config.graphql',
	eslintConfigContent: `# Default prettier configuration for GraphQL\n`,
	conventions: [
		'Follow standard GraphQL coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['prettier'],
};

/**
 * OpenAPI (actionlint) preset.
 */
export const OPENAPI_PRESET: IRulePreset = {
	id: 'openapi-actionlint',
	framework: 'openapi',
	language: 'openapi',
	linter: 'actionlint',
	linterConfigFile: 'openapi-actionlint.config.yaml',
	linterConfigContent: `# Default actionlint configuration for OpenAPI\n`,
	eslintConfigFile: 'openapi-actionlint.config.yaml',
	eslintConfigContent: `# Default actionlint configuration for OpenAPI\n`,
	conventions: [
		'Follow standard OpenAPI coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['actionlint'],
};

/**
 * Avro Schema (jsonlint) preset.
 */
export const AVSC_PRESET: IRulePreset = {
	id: 'avsc-jsonlint',
	framework: 'avsc',
	language: 'avsc',
	linter: 'jsonlint',
	linterConfigFile: 'avsc-jsonlint.config.avsc',
	linterConfigContent: `# Default jsonlint configuration for Avro Schema\n`,
	eslintConfigFile: 'avsc-jsonlint.config.avsc',
	eslintConfigContent: `# Default jsonlint configuration for Avro Schema\n`,
	conventions: [
		'Follow standard Avro Schema coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['jsonlint'],
};

/**
 * Thrift (jsonlint) preset.
 */
export const THRIFT_PRESET: IRulePreset = {
	id: 'thrift-jsonlint',
	framework: 'thrift',
	language: 'thrift',
	linter: 'jsonlint',
	linterConfigFile: 'thrift-jsonlint.config.thrift',
	linterConfigContent: `# Default jsonlint configuration for Thrift\n`,
	eslintConfigFile: 'thrift-jsonlint.config.thrift',
	eslintConfigContent: `# Default jsonlint configuration for Thrift\n`,
	conventions: [
		'Follow standard Thrift coding style.',
		'Keep functions and modules focused and reusable.',
	],
	requiredLinterDeps: ['jsonlint'],
};
