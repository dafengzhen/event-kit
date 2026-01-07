import type { APIConfig } from '../types/api.ts';

export const DEFAULT_CONFIG: Partial<APIConfig> = {
  timeout: 0,
  validateStatus: (status?: number) => typeof status === 'number' && status >= 200 && status < 300,
};
