export type IPluginRuntime<TRegistrations extends object> =
	Partial<TRegistrations> & {
		readonly registrations: TRegistrations;
		readonly dispose?: (() => Promise<void> | void) | undefined;
		/**
		 * Explicit abort capability. When omitted, the loader treats a runtime
		 * with `dispose()` as abortable and everything else as non-abortable.
		 */
		readonly abortable?: boolean | undefined;
	};
