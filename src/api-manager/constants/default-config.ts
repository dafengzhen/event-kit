import type { APIConfig } from '../types/api.ts';

export const DEFAULT_CONFIG: Partial<APIConfig> = {
  maxRedirects: 5,
  timeout: 30000,
  validateStatus: (status?: number) => typeof status === 'number' && status >= 200 && status < 300,
  withCredentials: false,
};
