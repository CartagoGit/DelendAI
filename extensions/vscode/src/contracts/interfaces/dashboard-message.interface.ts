import type { z } from 'zod';

import type { DASHBOARD_MESSAGE_SCHEMA } from '../constants/dashboard-message-schema.constant';

export type DashboardMessage = z.infer<typeof DASHBOARD_MESSAGE_SCHEMA>;
