'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, AlertCircle, Zap, Clock } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { WORKSPACE_TIMEZONE, WORKSPACE_TIMEZONE_LABEL } from '@/lib/constants/workspace-timezone';

function easternDayOfWeek(): number {
  const dayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    weekday: 'short',
  }).format(new Date());
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[dayShort] ?? new Date().getDay();
}

export function WeekendAutoMarkStatus() {
  const [isWeekend, setIsWeekend] = useState(false);
  const [isMarked, setIsMarked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dayName, setDayName] = useState('');

  useEffect(() => {
    checkWeekendStatus();
  }, []);

  const checkWeekendStatus = () => {
    const day = easternDayOfWeek();
    const isWeekendDay = day === 0 || day === 6;
    setIsWeekend(isWeekendDay);

    if (isWeekendDay) {
      const name = day === 0 ? 'Sunday' : 'Saturday';
      setDayName(name);
      setMessage(
        `Today is ${name} - Weekend auto-mark will run at 4:30 PM ${WORKSPACE_TIMEZONE_LABEL}`,
      );
    }
  };

  const handleManualTrigger = async () => {
    if (!isWeekend) {
      setError('Today is not a weekend. Auto-mark only works on Saturday/Sunday.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiClient.post('attendance/auto-mark-weekends', {});
      setMessage('✅ Weekend auto-mark triggered successfully for all employees');
      setIsMarked(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to trigger auto-mark');
    } finally {
      setLoading(false);
    }
  };

  const handleTestTrigger = async () => {
    setTestLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await apiClient.post('attendance/test/mark-weekend-now', {});
      if (response.data.success) {
        setMessage(
          `✅ ${response.data.message} (${response.data.usersMarked} employees marked)`,
        );
        setIsMarked(true);
      } else {
        setError(response.data.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to trigger test marking');
    } finally {
      setTestLoading(false);
    }
  };

  if (!isWeekend) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-start gap-3">
        <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
            🎉 {dayName} - Weekend Auto-Mark Active
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
            All employees will be automatically marked as &apos;weekend&apos; at{' '}
            <span className="font-bold">4:30 PM {WORKSPACE_TIMEZONE_LABEL}</span> today.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              <span>Scheduled time: 4:30 PM ET (16:30)</span>
            </div>
          </div>

          {isMarked && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              <span>Weekend marking completed for today</span>
            </div>
          )}

          {message && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleManualTrigger}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {loading ? 'Triggering…' : 'Trigger Auto-Mark Now'}
            </button>
            <button
              type="button"
              onClick={handleTestTrigger}
              disabled={testLoading}
              className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              {testLoading ? 'Testing…' : 'Test Mark (Debug)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
