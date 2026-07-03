import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const url = req.url || '';

    // Skip throttling for attendance analytics endpoints (allow 12 parallel requests)
    if (url.includes('/attendance/analytics/monthly') || 
        url.includes('/attendance/analytics/yearly') ||
        url.includes('/attendance/records')) {
      // Return a unique tracker that won't hit the limit
      return `skip-throttle-${Date.now()}-${Math.random()}`;
    }

    // Skip throttling for leave endpoints
    if (url.includes('/leave/')) {
      return `skip-throttle-${Date.now()}-${Math.random()}`;
    }

    // Large master-data uploads can take many minutes — do not throttle.
    if (url.includes('/master-data/import')) {
      return `skip-throttle-${Date.now()}-${Math.random()}`;
    }

    // Use default tracker for other endpoints
    return super.getTracker(req);
  }
}
