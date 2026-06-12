import type { BreakPunchToday } from '@/lib/api/break-punch.service';



export function completedBreakMinutesFromToday(data: BreakPunchToday): number {

  return (

    data.tea.usedMinutesCompleted +

    data.lunch.usedMinutesCompleted +

    data.meeting.usedMinutesCompleted

  );

}



export function dispatchBreakPunchState(active: boolean): void {

  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('break-punch:state', { detail: { active } }));

}


