#!/usr/bin/env bun
/** Path of the committed schema, relative to the repo root. */
export declare const CONFIG_SCHEMA_PATH =
	'packages/core/schema/delendai.config.schema.json';
/** Build the JSON Schema text (the exact bytes written to disk). */
export declare const buildConfigSchema: () => string;
