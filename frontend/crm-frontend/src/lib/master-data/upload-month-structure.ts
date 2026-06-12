import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';
import {
  CALENDAR_MONTHS,
  calendarPeriodFromDate,
  currentCalendarPeriod,
} from '@/lib/batches/month-structure';

export { CALENDAR_MONTHS };

export function uploadRequestPeriod(request: MasterDataUploadRequest): { month: number; year: number } {
  const date = request.createdAt ? new Date(request.createdAt) : new Date();
  return calendarPeriodFromDate(date);
}

export function groupUploadRequestsByMonth(
  requests: MasterDataUploadRequest[],
  year: number,
): Map<number, MasterDataUploadRequest[]> {
  const map = new Map<number, MasterDataUploadRequest[]>();
  for (let month = 1; month <= 12; month += 1) {
    map.set(month, []);
  }
  requests.forEach((request) => {
    const period = uploadRequestPeriod(request);
    if (period.year !== year) return;
    map.get(period.month)?.push(request);
  });
  map.forEach((list) => {
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  });
  return map;
}

export function buildUploadRequestYears(requests: MasterDataUploadRequest[]): number[] {
  const { year: currentYear } = currentCalendarPeriod();
  const years = new Set<number>([currentYear]);
  requests.forEach((request) => years.add(uploadRequestPeriod(request).year));
  return Array.from(years).sort((a, b) => b - a);
}

export function pickDefaultUploadMonth(
  byMonth: Map<number, MasterDataUploadRequest[]>,
  fallbackMonth: number,
): number {
  for (let month = 12; month >= 1; month -= 1) {
    if ((byMonth.get(month)?.length ?? 0) > 0) return month;
  }
  return fallbackMonth;
}

export function monthLabel(month: number): string {
  return CALENDAR_MONTHS.find((m) => m.index === month)?.label ?? 'Month';
}
