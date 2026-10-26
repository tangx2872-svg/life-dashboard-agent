import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { validate, emptyData, envelope } from './schema.mjs';
export function dbConfig() {
  // Explicit local project config wins over unrelated machine-wide MYSQL_* variables.
  const file=new URL('../.env',import.meta.url);
  const env={...process.env,...(existsSync(file)?parseEnv(readFileSync(file,'utf8')):{})};
  return {host:env.MYSQL_HOST||'127.0.0.1',port:Number(env.MYSQL_PORT||3306),user:env.MYSQL_USER||'life_dashboard',password:env.MYSQL_PASSWORD||'',database:env.MYSQL_DATABASE||'life_dashboard',charset:'utf8mb4',connectionLimit:4,connectTimeout:5000};
}
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export async function createStore(config=dbConfig()) {
  const pool=mysql.createPool(config);
  // Keep the existing document intact. Arrays, IDs, unknown fields, and order survive migration.
  await pool.query(`CREATE TABLE IF NOT EXISTS dashboard_state (
    id INT PRIMARY KEY, revision INT NOT NULL, body LONGTEXT NOT NULL, updated_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dashboard_snapshots (
    revision INT PRIMARY KEY, body LONGTEXT NOT NULL, saved_at VARCHAR(32) NOT NULL, reason VARCHAR(200) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dashboard_requests (
    request_id VARCHAR(80) PRIMARY KEY, payload_hash CHAR(64) NOT NULL, revision INT NOT NULL, saved_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.execute('INSERT IGNORE INTO dashboard_state VALUES (1,0,?,?)',[JSON.stringify(emptyData()),new Date().toISOString()]);
  const read=async()=>{const [rows]=await pool.query('SELECT * FROM dashboard_state WHERE id=1');if(!rows.length)throw Error('数据库状态缺失');const r=rows[0];return {data:validate(JSON.parse(r.body)),revision:r.revision,savedAt:r.updated_at};};
  // Read/validate at startup: never replace an unreadable database with sample content.
  await read();
  return {
    read,
    async commit({data,revision,requestId,reason='保存更改'}) {
      if(!Number.isSafeInteger(revision)||revision<0||typeof requestId!=='string'||!/^[-\w]{8,80}$/.test(requestId))throw new HttpError(400,'请求版本或编号无效');
      try{validate(data)}catch(e){throw new HttpError(400,e.message)}
      const json=JSON.stringify(data),hash=createHash('sha256').update(json).digest('hex');
      const c=await pool.getConnection();
      try{
        await c.beginTransaction();
        const [rows]=await c.query('SELECT * FROM dashboard_state WHERE id=1 FOR UPDATE');
        const current=rows[0];
        const [requests]=await c.execute('SELECT * FROM dashboard_requests WHERE request_id=?',[requestId]);
        if(requests.length){if(requests[0].payload_hash!==hash)throw new HttpError(409,'同一请求编号的内容不同');await c.commit();return {revision:requests[0].revision,savedAt:requests[0].saved_at,replayed:true};}
        if(current.revision!==revision)throw new HttpError(409,'另一个页面已保存更新。请刷新后重新操作，当前请求没有覆盖数据库。');
        const stamp=new Date().toISOString(),next=revision+1;
        await c.execute('INSERT INTO dashboard_snapshots VALUES (?,?,?,?)',[revision,current.body,stamp,String(reason).slice(0,200)]);
        await c.execute('UPDATE dashboard_state SET revision=?,body=?,updated_at=? WHERE id=1',[next,json,stamp]);
        await c.execute('INSERT INTO dashboard_requests VALUES (?,?,?,?)',[requestId,hash,next,stamp]);
        // Thirty complete states, not just a fragile browser-side undo record.
        await c.execute('DELETE FROM dashboard_snapshots WHERE revision < ?',[Math.max(0,next-30)]);
        await c.commit();return {revision:next,savedAt:stamp};
      }catch(e){await c.rollback();throw e}finally{c.release()}
    },
    async snapshots(){const [rows]=await pool.query('SELECT revision,saved_at AS savedAt,reason FROM dashboard_snapshots ORDER BY revision DESC');return rows;},
    async snapshot(revision){const [rows]=await pool.execute('SELECT body FROM dashboard_snapshots WHERE revision=?',[revision]);if(!rows.length)throw new HttpError(404,'没有这份快照');return envelope(validate(JSON.parse(rows[0].body)));},
    close:()=>pool.end()
  };
}
