import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runActivationBenchmark } from './activation-benchmark';

const manifestPath = resolve(import.meta.dirname, '../../package.json');

const main = async (): Promise<void> => {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		activationEvents?: readonly string[];
	};
	const report = await runActivationBenchmark(
		manifest.activationEvents ?? [],
	);
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

await main();
