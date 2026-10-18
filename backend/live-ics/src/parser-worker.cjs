// A separate process, fixed floating-time interpretation, no shared TZ registry.
const { parseICS } = require('../.build/domain/ics.js');
process.once('message', async ({ text, subscription, window, now }) => {
  try { const events = await parseICS(text, subscription, window, new Date(now)); if (Buffer.byteLength(JSON.stringify(events)) > 2 * 1024 * 1024) throw Error(); process.send({ events }); }
  catch { process.send({ error: 'invalid_feed' }); }
});
