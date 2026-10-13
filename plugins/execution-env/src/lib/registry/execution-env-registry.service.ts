import type {
	IExecutionEnvironment,
	IExecutionEnvironmentRegistration,
} from '../contracts/interfaces/execution-env.interface';

/**
 * The set of environment kinds this host knows how to build, by id.
 *
 * Registering the same id twice is an error rather than a silent
 * replacement: two adapters answering to one id would make a config file
 * mean different things depending on load order.
 */
export class ExecutionEnvRegistry {
	private readonly registrations = new Map<
		string,
		IExecutionEnvironmentRegistration
	>();

	register<TOptions>(
		registration: IExecutionEnvironmentRegistration<TOptions>,
	): this {
		if (registration.id.trim().length === 0) {
			throw new Error('execution environment id must not be empty');
		}
		if (this.registrations.has(registration.id)) {
			throw new Error(
				`execution environment already registered: ${registration.id}`,
			);
		}
		this.registrations.set(registration.id, {
			id: registration.id,
			label: registration.label,
			create: (options) => registration.create(options as TOptions),
		});
		return this;
	}

	has(id: string): boolean {
		return this.registrations.has(id);
	}

	/** Registered ids in registration order. */
	ids(): readonly string[] {
		return [...this.registrations.keys()];
	}

	/** Build an environment by id, or throw naming the ids that exist. */
	create(id: string, options?: unknown): IExecutionEnvironment {
		const registration = this.registrations.get(id);
		if (registration === undefined) {
			throw new Error(
				`unknown execution environment "${id}"; registered: ${this.ids().join(', ') || '(none)'}`,
			);
		}
		return registration.create(options);
	}
}
