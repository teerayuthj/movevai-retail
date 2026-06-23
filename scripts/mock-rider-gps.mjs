const base = (process.env.RIDER_API_URL ?? 'http://localhost:3000/v1/rider').replace(/\/$/, '');
const phone = process.env.RIDER_PHONE;
const pin = process.env.RIDER_PIN;
const routeId = process.env.ROUTE_ID;
const scenario = process.env.SCENARIO ?? 'normal';
if (!phone || !pin || !routeId) throw new Error('Set RIDER_PHONE, RIDER_PIN and ROUTE_ID');

async function api(path, init = {}, token) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}
const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone, pin, deviceId: `mock-${scenario}-device` }) });
const session = await api(`/routes/${routeId}/start`, { method: 'POST', body: JSON.stringify({ deviceId: `mock-${scenario}-device` }) }, login.token);
const origin = { lat: Number(process.env.START_LAT ?? 13.7563), lng: Number(process.env.START_LNG ?? 100.5018) };
const points = Array.from({ length: 24 }, (_, index) => {
  const detour = scenario === 'off-route' && index >= 8 && index <= 16 ? 0.003 : 0;
  return { clientPointId: crypto.randomUUID(), lat: origin.lat + index * 0.00025 + detour, lng: origin.lng + index * 0.0002, accuracy: 8, speed: 6, heading: 35, recordedAt: new Date(Date.now() + index * 10_000).toISOString() };
});
if (scenario === 'offline') {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  await api('/tracking/locations', { method: 'POST', body: JSON.stringify({ sessionId: session.id, deviceId: `mock-${scenario}-device`, points }) }, login.token);
} else {
  for (const point of points) {
    await api('/tracking/locations', { method: 'POST', body: JSON.stringify({ sessionId: session.id, deviceId: `mock-${scenario}-device`, points: [point] }) }, login.token);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
console.log(JSON.stringify({ scenario, sessionId: session.id, sent: points.length }, null, 2));
