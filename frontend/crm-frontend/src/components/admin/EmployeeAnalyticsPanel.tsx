'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Users, Calendar, ListChecks, ArrowLeft } from 'lucide-react';
import {
  activityLogsService,
  type EmployeeReport,
} from '@/lib/api/activity-logs.service';
import { listAnalyticsSubjects, type AnalyticsUserOption } from '@/lib/api/analytics-users';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { formatRoleLabel } from '@/lib/api/activity-logs.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { IDLE_TIMEOUT_MINUTES } from '@/lib/constants/session';
import { XlMetricCardSection, type MetricItem } from '@/components/admin/XlMetricCards';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import {
  AnalyticsPanel,
  FunnelChart,
  MiniTrendBars,
} from '@/components/analytics/AnalyticsCharts';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function XlSheetTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex border-b border-slate-300 bg-[#e8e8e8]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'border-r border-slate-300 px-4 py-1.5 text-[11px] font-semibold transition-colors',
            active === t.id
              ? 'bg-white text-[#217346] shadow-[inset_0_2px_0_#217346]'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmployeeAnalyticsPanel({
  initialUserId,
  showBackLink = false,
}: {
  /** Pre-select user (e.g. from Users → Report page) */
  initialUserId?: string;
  showBackLink?: boolean;
} = {}) {
  const [employees, setEmployees] = useState<AnalyticsUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leadTab, setLeadTab] = useState<'touched' | 'not_touched' | 'batches'>('touched');

  const selectedUser = useMemo(
    () => employees.find((e) => e.id === selectedId),
    [employees, selectedId],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: y - 2023 }, (_, i) => 2024 + i);
  }, [now]);

  useEffect(() => {
    listAnalyticsSubjects()
      .then((list) => {
        setEmployees(list);
        if (initialUserId) {
          setSelectedId(initialUserId);
        } else if (list.length > 0) {
          setSelectedId((prev) => prev || list[0].id);
        }
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoadingUsers(false));
  }, [initialUserId]);

  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    try {
      const data =
        tab === 'daily'
          ? await activityLogsService.getDailyReport(selectedId, selectedDate)
          : await activityLogsService.getMonthlyReport(selectedId, year, month);
      setReport(data);
    } catch (e) {
      setError(extractApiError(e, 'Failed to load employee report'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [tab, selectedId, selectedDate, year, month]);

  useEffect(() => {
    if (!selectedId) return;
    setReport(null);
    loadReport();
  }, [loadReport, selectedId]);

  const s = report?.summary;
  const la = report?.leadActivity.summary;

  const assignedRows: MetricItem[] = la
    ? [
        { label: 'Total leads (assigned)', value: la.totalLeads, note: `${report!.employee.name} · ${la.batchCount} batch(es)` },
        { label: 'Active (assigned)', value: la.activeLeads, note: 'Status Active in their batches' },
        { label: 'Won (assigned)', value: la.wonLeads, note: 'Status Lead / Won in their batches' },
      ]
    : [];

  const periodRows: MetricItem[] = la
    ? [
        { label: 'Leads worked (this period)', value: la.periodWorkedLeads, note: 'Touched, updated, or viewed in period' },
        { label: 'Won worked (this period)', value: la.periodWonLeads, note: 'Won status among period work' },
        { label: 'Touched (activity)', value: la.touched, note: 'Unique leads with any activity in period' },
        { label: 'Updated', value: la.updated, note: 'Field updates logged' },
        { label: 'Touched only (no update)', value: la.touchedOnly ?? Math.max(0, la.touched - la.updated - la.viewedOnly), note: 'Touch without update' },
        { label: 'Viewed only', value: la.viewedOnly, note: 'Opened / viewed only' },
        { label: 'Not touched', value: la.notTouched, note: 'Assigned but no activity in period' },
      ]
    : [];

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        value: emp.id,
        label: `${emp.name}${emp.employeeId ? ` (${emp.employeeId})` : ''} — ${formatRoleLabel(emp.role)}`,
      })),
    [employees],
  );

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          value: String(m),
          label: new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' }),
        };
      }),
    [],
  );

  const yearOptionsList = useMemo(
    () => yearOptions.map((y) => ({ value: String(y), label: String(y) })),
    [yearOptions],
  );

  const sessionRows: MetricItem[] = s
    ? [
        { label: 'Logins', value: s.loginCount },
        { label: 'Logouts', value: s.logoutCount, note: `Manual ${s.manualLogoutCount} · Idle ${s.idleLogoutCount}` },
        { label: 'Total active time', value: s.totalActiveFormatted, note: `${s.totalActiveMinutes} min` },
        { label: 'Avg session', value: s.avgSessionFormatted },
        { label: 'Avg logout time', value: s.avgLogoutTime },
        { label: 'Longest session', value: s.longestSessionFormatted },
        { label: 'Actions logged', value: s.actionCount },
      ]
    : [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-0 border border-slate-300 bg-[#e8e8e8]">
      {showBackLink && (
        <div className="flex items-center gap-2 border-b border-slate-300 bg-[#f3f3f3] px-3 py-2">
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#217346] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to users
          </Link>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-semibold text-slate-700">Activity report</span>
        </div>
      )}
      {/* XL toolbar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-300 bg-[#217346] px-4 py-2.5 text-white">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-white/80">
            <Users className="h-3 w-3" />
            Employee
          </label>
          <XlToolbarSelect
            value={selectedId}
            onChange={setSelectedId}
            options={employeeOptions}
            placeholder={loadingUsers ? 'Loading employees…' : 'No employees found'}
            disabled={loadingUsers || employees.length === 0}
          />
        </div>

        <div className="flex border border-white/30">
          {(['daily', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold capitalize',
                tab === t ? 'bg-white text-[#217346]' : 'text-white/90 hover:bg-white/10',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'daily' ? (
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-white/80">
              <Calendar className="h-3 w-3" />
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayIso()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-white/25 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm transition-shadow duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[#217346]"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-white/80">Month</label>
              <XlToolbarSelect
                value={String(month)}
                onChange={(v) => setMonth(Number(v))}
                options={monthOptions}
              />
            </div>
            <div className="min-w-[88px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-white/80">Year</label>
              <XlToolbarSelect
                value={String(year)}
                onChange={(v) => setYear(Number(v))}
                options={yearOptionsList}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={loadReport}
          disabled={loading || !selectedId}
          className="inline-flex items-center gap-1 border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {selectedUser && (
        <p className="border-b border-slate-300 bg-[#f3f3f3] px-4 py-1.5 text-[11px] text-slate-600">
          {selectedUser.email}
          {selectedUser.employeeId && ` · ${selectedUser.employeeId}`}
          {' · '}
          <span className="font-semibold text-slate-800">{formatRoleLabel(selectedUser.role)}</span>
        </p>
      )}

      {error && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center gap-2 border-b border-slate-300 bg-white py-16 text-sm text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin text-[#217346]" />
          Loading report…
        </div>
      )}

      {report && s && la && (
        <div className="space-y-0">
          <div className="border-b border-slate-300 bg-white px-4 py-2">
            <p className="text-sm font-semibold text-slate-900">
              {report.employee.name}
              {report.employee.employeeId ? ` · ${report.employee.employeeId}` : ''}
            </p>
            <p className="text-[11px] text-slate-500">
              {report.period.label}
              {la.batchCount === 0 ? ' · Share batches from Batches page to see assigned leads' : ''}
            </p>
          </div>

          <div className="grid gap-0 border-b border-slate-300 lg:grid-cols-2">
            <XlMetricCardSection title="Assigned pipeline" rows={assignedRows} columns={1} />
            <XlMetricCardSection title="Session & system" rows={sessionRows} columns={2} />
          </div>
          <XlMetricCardSection title="Lead activity · this period" rows={periodRows} columns={3} />

          <div className="grid gap-0 border-t border-slate-300 lg:grid-cols-2">
            <AnalyticsPanel
              title="Lead work funnel"
              subtitle="How assigned leads were worked in this period"
              className="rounded-none border-0 border-r border-slate-300 shadow-none"
            >
              <FunnelChart
                items={[
                  { label: 'Total assigned', value: la.totalLeads, color: '#6366f1' },
                  { label: 'Worked', value: la.periodWorkedLeads, color: '#10b981' },
                  { label: 'Updated', value: la.updated, color: '#8b5cf6' },
                  { label: 'Not touched', value: la.notTouched, color: '#f59e0b' },
                ]}
              />
              {la.totalLeads > 0 && (
                <p className="mt-4 text-center text-xs text-slate-500">
                  Work rate:{' '}
                  <span className="font-semibold text-emerald-700">
                    {Math.round((la.periodWorkedLeads / la.totalLeads) * 100)}%
                  </span>
                  {' · '}
                  Update rate:{' '}
                  <span className="font-semibold text-violet-700">
                    {Math.round((la.updated / la.totalLeads) * 100)}%
                  </span>
                </p>
              )}
            </AnalyticsPanel>

            {tab === 'monthly' && report.dailyBreakdown && report.dailyBreakdown.length > 0 ? (
              <AnalyticsPanel
                title="Daily active time"
                subtitle="Minutes logged per day this month"
                className="rounded-none border-0 shadow-none"
              >
                <MiniTrendBars
                  data={report.dailyBreakdown.map((d) => ({
                    label: d.date.slice(-2),
                    minutes: d.totalActiveMinutes,
                  }))}
                  labelKey="label"
                  valueKey="minutes"
                  color="#217346"
                  formatValue={(v) => `${v} min`}
                />
                <p className="mt-2 text-center text-[10px] text-slate-400">
                  Click a day row below for full daily detail
                </p>
              </AnalyticsPanel>
            ) : (
              <AnalyticsPanel
                title="Pipeline snapshot"
                subtitle="Assigned batch breakdown"
                className="rounded-none border-0 shadow-none"
              >
                <FunnelChart
                  items={[
                    { label: 'Batches', value: la.batchCount, color: '#06b6d4' },
                    { label: 'Active leads', value: la.activeLeads, color: '#10b981' },
                    { label: 'Won leads', value: la.wonLeads, color: '#8b5cf6' },
                  ]}
                />
              </AnalyticsPanel>
            )}
          </div>

          <div className="border-t border-slate-300 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5">
              <ListChecks className="h-3.5 w-3.5 text-[#217346]" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Lead detail
              </span>
            </div>
            <XlSheetTabs
              active={leadTab}
              onChange={(id) => setLeadTab(id as typeof leadTab)}
              tabs={[
                { id: 'touched', label: 'Worked leads' },
                { id: 'not_touched', label: 'Not touched' },
                { id: 'batches', label: 'By batch' },
              ]}
            />

            <div className="max-h-96 overflow-auto">
              {leadTab === 'batches' && (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f3f3f3] text-left text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Batch</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Total</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Active</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Won</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Touched</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Updated</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Not touched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.leadActivity.byBatch.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                          No assigned batches with leads
                        </td>
                      </tr>
                    ) : (
                      report.leadActivity.byBatch.map((b) => (
                        <tr key={b.batchId} className="hover:bg-[#f9fff9]">
                          <td className="border border-slate-200 px-2 py-1 font-medium text-slate-800">{b.batchName}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono">{b.totalLeads}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono text-emerald-800">{b.activeLeads}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono text-violet-800">{b.wonLeads}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono">{b.touched}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono text-[#217346]">{b.updated}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono text-amber-800">{b.notTouched}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {leadTab === 'touched' && (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#f3f3f3] text-left text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Lead</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Batch</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Status</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Changed fields</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.leadActivity.touchedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                          No leads worked in this period
                        </td>
                      </tr>
                    ) : (
                      report.leadActivity.touchedLeads.map((l) => (
                        <tr key={`${l.batchId}-${l.leadKey}`} className="hover:bg-[#f9fff9]">
                          <td className="border border-slate-200 px-2 py-1 font-medium text-slate-800">{l.leadLabel}</td>
                          <td className="border border-slate-200 px-2 py-1 text-slate-600">{l.batchName}</td>
                          <td className="border border-slate-200 px-2 py-1 capitalize text-[#217346]">{l.status}</td>
                          <td className="max-w-[200px] truncate border border-slate-200 px-2 py-1 text-slate-500">
                            {l.changedColumns?.length ? l.changedColumns.join(', ') : '—'}
                          </td>
                          <td className="whitespace-nowrap border border-slate-200 px-2 py-1 text-right text-slate-500">
                            {formatDateTime(l.lastAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {leadTab === 'not_touched' && (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#f3f3f3] text-left text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Lead</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Batch</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Row</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.leadActivity.notTouchedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                          All assigned leads were worked in this period
                        </td>
                      </tr>
                    ) : (
                      report.leadActivity.notTouchedLeads.map((l) => (
                        <tr key={`${l.batchId}-${l.leadKey}-nt`} className="hover:bg-[#f9fff9]">
                          <td className="border border-slate-200 px-2 py-1 font-medium text-slate-800">{l.leadLabel}</td>
                          <td className="border border-slate-200 px-2 py-1 text-slate-600">{l.batchName}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right font-mono text-slate-500">{l.rowIndex + 1}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {tab === 'monthly' && report.dailyBreakdown && report.dailyBreakdown.length > 0 && (
            <div className="border-t border-slate-300 bg-white">
              <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
                Day-wise summary · click row for daily detail
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Date</th>
                      <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Logins</th>
                      <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Logouts</th>
                      <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Active time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dailyBreakdown.map((d) => (
                      <tr
                        key={d.date}
                        className="cursor-pointer hover:bg-[#e8f5ee]"
                        onClick={() => {
                          setTab('daily');
                          setSelectedDate(d.date);
                        }}
                      >
                        <td className="border border-slate-200 px-2 py-1 font-medium">{d.date}</td>
                        <td className="border border-slate-200 px-2 py-1 text-right font-mono">{d.loginCount}</td>
                        <td className="border border-slate-200 px-2 py-1 text-right font-mono">{d.logoutCount}</td>
                        <td className="border border-slate-200 px-2 py-1 text-right font-mono">{d.totalActiveFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="border-t border-slate-300 bg-white">
            <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
              Login sessions
            </div>
            {report.sessions.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400">No login sessions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Login</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Logout</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Duration</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold text-right">Logout time</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sessions.map((sess) => (
                      <tr key={`${sess.sessionId}-${sess.loginAt}`} className="hover:bg-[#f9fff9]">
                        <td className="border border-slate-200 px-2 py-1">{formatDateTime(sess.loginAt)}</td>
                        <td className="border border-slate-200 px-2 py-1">
                          {sess.logoutAt ? formatDateTime(sess.logoutAt) : '—'}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right font-mono font-semibold">
                          {sess.durationFormatted}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right font-mono">{sess.logoutTime}</td>
                        <td className="border border-slate-200 px-2 py-1">
                          {sess.stillActive
                            ? 'Still active'
                            : sess.logoutType === 'IDLE_LOGOUT'
                              ? 'Idle auto'
                              : 'Manual'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t border-slate-300 bg-white">
            <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
              Activity log
            </div>
            {report.activities.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400">No activities recorded for this period.</p>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Date &amp; time</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Action</th>
                      <th className="border border-slate-200 px-2 py-1 font-semibold">Page / resource</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.activities.map((a) => (
                      <tr key={a.id} className="hover:bg-[#f9fff9]">
                        <td className="border border-slate-200 px-2 py-1 text-slate-500">{formatDateTime(a.createdAt)}</td>
                        <td className="border border-slate-200 px-2 py-1 font-medium text-slate-800">
                          {formatActivityAction(a.action)}
                        </td>
                        <td className="max-w-[280px] truncate border border-slate-200 px-2 py-1 text-slate-500" title={a.path}>
                          {a.path ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !report && !error && selectedId && (
        <p className="bg-white py-12 text-center text-sm text-slate-400">Choose date or month to view analytics.</p>
      )}

      <p className="border-t border-slate-300 bg-[#f3f3f3] px-4 py-2 text-[10px] text-slate-500">
        Auto logout after {IDLE_TIMEOUT_MINUTES} minutes of inactivity. Monthly view — click a day row to open daily
        detail.
      </p>
    </div>
  );
}
