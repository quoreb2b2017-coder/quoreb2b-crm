'use client';

import { cn } from '@/lib/utils/cn';

export function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="h-1 bg-slate-200" />
      <div className="space-y-4 p-5">
        <div className="flex justify-between">
          <div className="h-10 w-10 rounded-xl bg-slate-100" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-slate-100" />
        <div className="h-3 w-32 rounded bg-slate-100" />
        <div className="h-1.5 w-full rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function SkeletonMetricCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 h-6 w-24 rounded bg-slate-100" />
      <div className="mb-2 h-10 w-32 rounded bg-slate-100" />
      <div className="h-4 w-40 rounded bg-slate-100" />
    </div>
  );
}

export function SkeletonHealthPanel() {
  return (
    <div className="animate-pulse rounded border border-slate-300 bg-white p-4">
      <div className="mb-3 h-4 w-32 rounded bg-slate-100" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between border border-slate-200 px-2 py-1.5">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="h-3 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChartPanel() {
  return (
    <div className="animate-pulse rounded border border-slate-300 bg-white p-4">
      <div className="mb-3 h-4 w-40 rounded bg-slate-100" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-3 w-12 rounded bg-slate-100" />
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Welcome banner skeleton */}
      <div className="animate-pulse rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 p-8 shadow-xl">
        <div className="mb-4 h-6 w-48 rounded bg-slate-300" />
        <div className="h-8 w-64 rounded bg-slate-300" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>

      {/* Health and chart panels */}
      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <div className="border-b border-slate-300 lg:border-b-0 lg:border-r">
          <SkeletonHealthPanel />
        </div>
        <div>
          <SkeletonChartPanel />
        </div>
      </div>
    </div>
  );
}
