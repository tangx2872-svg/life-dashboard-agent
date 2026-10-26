import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
export async function fixture(appOptions={}){
  // Only this project's isolated MySQL instance. Never the user's configured production schema.
  const config=JSON.parse(readFileSync(new URL('../.local/mysql-local.json',import.meta.url),'utf8'));
  const db='life_dashboard_test_'+randomBytes(6).toString('hex');
  const options={host:'127.0.0.1',port:config.port,user:'root',password:config.password};
  const admin=await mysql.createConnection(options);await admin.query('CREATE DATABASE `'+db+'` CHARACTER SET utf8mb4');
  const store=await createStore({...options,database:db}),server=createApp(store,appOptions);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  return {store,server,url,options:{...options,database:db},async close(){await new Promise(r=>server.close(r));await store.close();if(!/^life_dashboard_test_[a-f0-9]{12}$/.test(db))throw Error('Unsafe test database');await admin.query('DROP DATABASE `'+db+'`');await admin.end();}};
}
