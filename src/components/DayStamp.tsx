export function dayAge(currentDay: number, observedDay: number): number {
  return Math.max(0, currentDay - observedDay);
}

export function DayStamp({
  currentDay,
  observedDay,
  verb,
}: {
  currentDay: number;
  observedDay: number;
  verb: string;
}) {
  const age = dayAge(currentDay, observedDay);
  return (
    <span className={`day-stamp ${age === 0 ? 'fresh' : 'stale'}`}>
      {verb} Day {observedDay} · {age === 0 ? 'current' : `${age} ${age === 1 ? 'day' : 'days'} old`}
    </span>
  );
}
