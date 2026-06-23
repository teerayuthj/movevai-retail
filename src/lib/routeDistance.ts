export function formatRouteDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} กม.`;
  return `${Math.max(1, Math.round(distanceMeters / 10) * 10)} ม.`;
}
