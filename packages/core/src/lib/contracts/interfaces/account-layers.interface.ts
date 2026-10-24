import type { z } from 'zod';

import type { PERSONAL_LAYER_SCHEMA } from '../constants/personal-layer-schema.constant';

/** Which layer an account came from. */
export type IAccountLayer = 'shared' | 'personal';

/** A person's project file, as read. */
export type IPersonalLayer = z.infer<typeof PERSONAL_LAYER_SCHEMA>;

/** Where a person's accounts are read, and the layer each account came from. */
export interface IAccountLayersReport {
	/** The person's file for this project, outside the repository. */
	readonly personalLayer: string;
	readonly layers: readonly {
		readonly accountId: string;
		readonly layer: IAccountLayer;
	}[];
}
