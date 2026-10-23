#!/usr/bin/env bun
import {
	measureCatalogAndTaskContextCost,
	renderCatalogAndTaskContextMarkdown,
} from './catalog-task-context-cost';

const main = async (): Promise<number> => {
	// c00521: pass `--strict-envelope` to make the benchmark exit 1
	// when the project_context envelope is degraded (the default is
	// advisory: the degradation is logged but the measurement
	// completes so the dashboard keeps working while the fixture
	// setup is fixed — see c00526).
	const strictEnvelope = process.argv.includes('--strict-envelope');
	const measurement = await measureCatalogAndTaskContextCost({
		strictEnvelope,
	});
	console.log(renderCatalogAndTaskContextMarkdown(measurement));
	return 0;
};

const exitCode = await main().catch((error: unknown) => {
	console.error(
		`catalog-task-context-cost failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	return 1;
});

process.exit(exitCode);
