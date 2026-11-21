import type { z } from 'zod';

import type { CONFIGURATION_CENTER_MESSAGE_SCHEMA } from '../constants/configuration-center-message-schema.constant';

export type ConfigurationCenterMessage = z.infer<
	typeof CONFIGURATION_CENTER_MESSAGE_SCHEMA
>;
