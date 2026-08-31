#!/usr/bin/env bun
import {
	measureCatalogAndTaskContextCost,
	renderCatalogAndTaskContextMarkdown,
} from './catalog-task-context-cost';

const main = async (): Promise<number> => {
	const measurement = await measureCatalogAndTaskContextCost();
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
