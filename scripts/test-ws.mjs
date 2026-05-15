// WebSocket smoke test — subscribes to active markets and prints ALL events for 30s.
// Run: node scripts/test-ws.mjs
import WebSocket from 'ws';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

const TOKEN_IDS = [
  '51797157743046504218541616681751597845468055908324407922581755135522797852101',
  '18690049947242812495755151360212639738977254879109748949267393375856311641700',
  '2213957649161627793381994368131485505647723208738124952452819345058597751695',
  '39223330966352513418907732239455948906399882924787587183466504819170775983376',
  '50862799703982327636174441241062907649998751737045006653560124656563256528691',
];

const ws = new WebSocket(WS_URL);
let eventCount = 0;
const eventTypes = {};

ws.on('open', () => {
  console.log('[ws] connected');
  ws.send(JSON.stringify({ assets_ids: TOKEN_IDS, type: 'market' }));
  setInterval(() => ws.send('PING'), 10_000);
});

ws.on('message', (data) => {
  const raw = data.toString();
  if (raw === 'PONG') { console.log('[ws] PONG'); return; }
  try {
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const e of events) {
      eventCount++;
      // Detect event type
      const key = e.event_type ?? (e.price_changes ? 'price_changes' : e.bids ? 'book' : 'unknown');
      eventTypes[key] = (eventTypes[key] ?? 0) + 1;
      // Print full event for first 3 of each type
      if (eventTypes[key] <= 2) {
        console.log(`\n[event:${key}]`, JSON.stringify(e));
      }
    }
  } catch {
    console.log('[ws] raw:', raw.slice(0, 300));
  }
});

ws.on('error', (err) => console.error('[ws] error:', err.message));
ws.on('close', (code) => console.log('[ws] closed:', code));

setTimeout(() => {
  console.log(`\n=== done: ${eventCount} events ===`);
  console.log('event types:', eventTypes);
  ws.close();
  process.exit(0);
}, 30_000);
