import { runActivationBenchmark } from './activation-benchmark';

const main = async (): Promise<void> => {
	const report = await runActivationBenchmark({
		keepEvidence: process.argv.includes('--keep-evidence'),
	});
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

await main();
