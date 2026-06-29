export function formatRouteDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} กม.`;
  return `${Math.max(1, Math.round(distanceMeters / 10) * 10)} ม.`;
}

/** เวลาเดินทางตามถนนจาก OSRM (วินาที) → ข้อความ เช่น "1 ชม. 5 นาที" / "12 นาที" */
export function formatRouteDuration(durationSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
  return `${minutes} นาที`;
}
