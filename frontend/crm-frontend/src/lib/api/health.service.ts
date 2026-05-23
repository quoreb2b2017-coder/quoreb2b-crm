import apiClient from './client';
import { deduplicatedFetch } from './cache';

export interface HealthCheckItem {
  status: string;
  label: string;
  state?: string;
  enabled?: boolean;
}

export interface SystemHealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version?: string;
  checks: {
    api: HealthCheckItem;
    database: HealthCheckItem;
    redis: HealthCheckItem;
    elasticsearch: HealthCheckItem;
  };
}

export const healthService = {
  getStatus: async () => {
    return deduplicatedFetch('health:status', async () => {
      const { data } = await apiClient.get('/health');
      const body = data as { data?: SystemHealthResponse };
      return (body?.data ?? data) as SystemHealthResponse;
    });
  },
};
