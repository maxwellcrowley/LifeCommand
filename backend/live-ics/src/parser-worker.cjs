// A separate process; floating event values are rejected before interpretation.
const { parseICS, UnsupportedICSTimeError } = require('../.build/domain/ics.js');
process.once('message', async ({ text, subscription, window, now }) => {
  try { const events = await parseICS(text, subscription, window, new Date(now)); if (Buffer.byteLength(JSON.stringify(events)) > 2 * 1024 * 1024) throw Error(); process.send({ events }); }
  catch (error) { process.send({ error: error instanceof UnsupportedICSTimeError ? 'unsupported_time' : 'invalid_feed' }); }
});
