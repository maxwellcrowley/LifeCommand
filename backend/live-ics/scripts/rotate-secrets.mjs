import pg from 'pg';
import { secretBox } from '../src/secrets.mjs';
// Run privately with both old and new keys present; never print row data.
const pool=new pg.Pool({connectionString:process.env.LIVE_ICS_DATABASE_URL,max:1});
try {
  const current=process.env.LIVE_ICS_KEY_VERSION,box=secretBox(JSON.parse(process.env.LIVE_ICS_KEYS),current);
  let count=0;
  for(;;){
    const c=await pool.connect();
    try {
      await c.query('begin');
      const rows=(await c.query("select owner_id,id,secret from live_ics_private.secrets where secret->>'version'<>$1 limit 20 for update skip locked",[current])).rows;
      for(const row of rows) await c.query('update live_ics_private.secrets set secret=$3 where owner_id=$1 and id=$2',[row.owner_id,row.id,box.seal(box.open(row.secret,row.owner_id,row.id),row.owner_id,row.id)]);
      await c.query('commit');count+=rows.length;if(!rows.length)break;
    }catch{await c.query('rollback');throw Error();}finally{c.release();}
  }
  console.log(`Rotated ${count} subscription secrets. Retain old keys for retained backups.`);
}catch{console.error('Secret rotation failed. No secret values were logged; check server configuration and key availability.');process.exitCode=1;}
finally{await pool.end();}
