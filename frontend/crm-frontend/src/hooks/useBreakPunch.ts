'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  breakPunchService,
  createEmptyBreakPunchToday,
  type BreakPunchToday,
  type BreakType,
} from '@/lib/api/break-punch.service';
import { extractApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/store/auth.store';
import { dispatchBreakPunchState } from '@/lib/attendance/break-minutes';
import { connectSocket } from '@/lib/socket/socket.client';

function hasSessionToken() {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('accessToken'));
}

function needsMeetingApproval(roles: string[] | undefined) {
  if (!roles?.length) return false;
  if (roles.includes('admin') || roles.includes('super_admin')) return false;
  return roles.includes('employee') || roles.includes('db_admin');
}

export function useBreakPunch(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<BreakPunchToday>(() => createEmptyBreakPunchToday());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<BreakType | null>(null);
  const [requestingMeeting, setRequestingMeeting] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const canUse = enabled && (isAuthenticated || hasSessionToken());
  const meetingNeedsApproval = needsMeetingApproval(user?.roles);

  const load = useCallback(async () => {
    if (!canUse) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await breakPunchService.getToday();
      setData(res);
      setTick(0);
      dispatchBreakPunchState(Boolean(res.activeType));
    } catch (e) {
      setError(extractApiError(e, 'Could not sync punches'));
      setData((prev) => prev ?? createEmptyBreakPunchToday());
    } finally {
      setLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => load(), 50);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!data?.activeType) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [data?.activeType]);

  useEffect(() => {
    if (!accessToken || !canUse) return;
    const socket = connectSocket(accessToken);
    const onMeetingUpdate = () => {
      void load();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('work-time:refresh'));
      }
    };
    socket.on('meeting-request:updated', onMeetingUpdate);
    socket.on('meeting-request:pending', onMeetingUpdate);
    return () => {
      socket.off('meeting-request:updated', onMeetingUpdate);
      socket.off('meeting-request:pending', onMeetingUpdate);
    };
  }, [accessToken, canUse, load]);

  const toggle = useCallback(async (type: BreakType) => {
    setToggling(type);
    setError('');
    try {
      const next = await breakPunchService.toggle(type);
      setData(next);
      setTick(0);
      dispatchBreakPunchState(Boolean(next.activeType));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('work-time:refresh'));
      }
    } catch (e) {
      setError(extractApiError(e, 'Punch failed'));
    } finally {
      setToggling(null);
    }
  }, []);

  const requestMeeting = useCallback(async () => {
    setRequestingMeeting(true);
    setError('');
    try {
      const next = await breakPunchService.requestMeeting();
      setData(next);
      setTick(0);
      dispatchBreakPunchState(Boolean(next.activeType));
    } catch (e) {
      setError(extractApiError(e, 'Meeting request failed'));
    } finally {
      setRequestingMeeting(false);
    }
  }, []);

  const liveRemaining = useMemo(() => {
    if (!data?.activeType) return null;
    const status =
      data.activeType === 'tea'
        ? data.tea
        : data.activeType === 'lunch'
          ? data.lunch
          : data.meeting;
    const base = status.remainingSeconds;
    return Math.max(0, base - tick);
  }, [data, tick]);

  const activeElapsed = useMemo(() => {
    if (!data?.activeType) return 0;
    const base =
      data.activeType === 'tea'
        ? data.tea.activeElapsedSeconds
        : data.activeType === 'lunch'
          ? data.lunch.activeElapsedSeconds
          : data.meeting.activeElapsedSeconds;
    return (base ?? 0) + tick;
  }, [data, tick]);

  const meetingPending = data.meetingRequest?.status === 'pending';

  return {
    data,
    loading,
    toggling,
    requestingMeeting,
    meetingNeedsApproval,
    meetingPending,
    error,
    activeElapsed,
    liveRemainingSeconds: liveRemaining,
    reload: load,
    toggle,
    requestMeeting,
  };
}
