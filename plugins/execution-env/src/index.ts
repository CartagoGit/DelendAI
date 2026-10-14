import { definePlugin } from '@delendai/core/public';
import z from 'zod';

/**
 * `@delendai/execution-env` — where a command runs.
 *
 * The agent used to assume the repository on this machine. This plugin
 * is the contract that lets it run elsewhere: in a container, a compose
 * service, over ssh or inside a container that already exists. Adapters
 * register by id; a project picks one in its configuration.
 *
 * It exposes no tool of its own: the environments are consumed by the
 * runner, which prepares one before a slice and releases it after.
 */
export default definePlugin({
	name: 'execution-env',
	version: '0.1.0',
	describe:
		'Execution environments (local, Docker, Docker Compose, SSH, Docker Exec) behind one contract and registry, consumed by the runner.',
	optionsSchema: z.object({}),
	register() {
		return { tools: [] };
	},
});
