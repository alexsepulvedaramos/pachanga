export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m.toString().padStart(2, '0')}`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
