'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, AlertCircle, Zap, Clock } from 'lucide-react';
import apiClient from '@/lib/api/client';

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
    const today = new Date();
    const day = today.getDay();
    const isWeekendDay = day === 0 || day === 6;
    setIsWeekend(isWeekendDay);

    if (isWeekendDay) {
      const name = day === 0 ? 'Sunday' : 'Saturday';
      setDayName(name);
      setMessage(`Today is ${name} - Weekend auto-mark will run at 4:20 PM IST`);
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
      const response = await apiClient.post('attendance/auto-mark-weekends', {});
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
          `✅ ${response.data.message} (${response.data.usersMarked} employees marked)`
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
            All employees will be automatically marked as 'weekend' at <span className="font-bold">4:20 PM IST</span> today.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              <span>Scheduled time: 4:20 PM IST (16:20)</span>
            </div>
          </div>

          {isMarked && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              Already marked for today
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {!isMarked && (
              <button
                onClick={handleManualTrigger}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 dark:bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                <Zap className="h-4 w-4" />
                {loading ? 'Marking...' : 'Mark Now (4:20 PM)'}
              </button>
            )}

            <button
              onClick={handleTestTrigger}
              disabled={testLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-600 dark:border-amber-500 bg-transparent px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
            >
              <Zap className="h-4 w-4" />
              {testLoading ? 'Testing...' : '🧪 Test Now'}
            </button>
          </div>

          {message && (
            <div className="mt-3 flex items-start gap-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
