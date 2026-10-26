// Optional Windows convenience setup: a separate instance, never the user's existing data directory.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
const root=fileURLToPath(new URL('../',import.meta.url)),local=path.join(root,'.local');
process.chdir(root);mkdirSync(local,{recursive:true});
const configFile=path.join(local,'mysql-local.json'),envFile=path.join(root,'.env');
const existing=existsSync(configFile)?JSON.parse(readFileSync(configFile,'utf8')):null;
const exe=process.env.MYSQLD_PATH||'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe';
const port=Number(process.env.LOCAL_MYSQL_PORT||33316);
const config=existing||{port,password:randomBytes(24).toString('hex'),dataDir:path.join(local,'mysql-data'),exe};
const connect=()=>mysql.createConnection({host:'127.0.0.1',port:config.port,user:'root',password:config.password,connectTimeout:1500});
if(process.argv[2]==='stop'){
  if(!existing)throw Error('没有本项目的独立 MySQL 配置');
  const c=await connect();await c.query('SHUTDOWN');await c.end();console.log('已停止本项目独立 MySQL。');
}else{
  if(!existsSync(config.exe))throw Error('请安装 MySQL 8.0+，或设置 MYSQLD_PATH 指向 mysqld.exe；也可按 README 使用已有 MySQL。');
  if(!existing&&existsSync(envFile))throw Error('已有 .env，未覆盖。请按当前配置启动，或先自行保存并移走 .env 再使用独立实例。');
  let connection;try{connection=await connect()}catch{}
  if(!connection){
    if(!existsSync(path.join(config.dataDir,'mysql'))){
      mkdirSync(config.dataDir,{recursive:true});
      // Bootstrap password is generated, used only in a local init file and removed after startup.
      await new Promise((resolve,reject)=>{const p=spawn(config.exe,['--no-defaults','--initialize-insecure','--datadir='+config.dataDir,'--basedir='+path.dirname(path.dirname(config.exe))],{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('MySQL 初始化失败，请检查安装和目录权限')));});
    }
    // An init file avoids exposing a password in command arguments or waiting with an empty root password.
    const init=path.join(local,'mysql-init.sql');
    writeFileSync(init,"ALTER USER 'root'@'localhost' IDENTIFIED BY '"+config.password+"';\n",{mode:0o600});
    writeFileSync(configFile,JSON.stringify(config,null,2),{mode:0o600});
    const out=openSync(path.join(local,'mysql.log'),'a');
    const child=spawn(config.exe,['--no-defaults','--datadir='+config.dataDir,'--basedir='+path.dirname(path.dirname(config.exe)),'--port='+config.port,'--bind-address=127.0.0.1','--mysqlx=OFF','--max-allowed-packet=32M','--init-file='+init],{windowsHide:true,detached:true,stdio:['ignore',out,out]});
    child.unref();closeSync(out);
    for(let i=0;i<90;i++){try{connection=await connect();break}catch{await new Promise(r=>setTimeout(r,500));}}
    const {unlinkSync}=await import('node:fs');if(connection)unlinkSync(init);
    if(!connection)throw Error('独立 MySQL 启动失败，查看 .local/mysql.log；若端口占用请设置 LOCAL_MYSQL_PORT。');
  }
  await connection.query('CREATE DATABASE IF NOT EXISTS life_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  if(!existsSync(envFile)){
    const appPassword=randomBytes(24).toString('hex');
    await connection.query("CREATE USER IF NOT EXISTS 'life_dashboard'@'127.0.0.1' IDENTIFIED BY ?",[appPassword]);
    await connection.query("ALTER USER 'life_dashboard'@'127.0.0.1' IDENTIFIED BY ?",[appPassword]);
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON life_dashboard.* TO 'life_dashboard'@'127.0.0.1'");
    writeFileSync(envFile,`PORT=3000\nMYSQL_HOST=127.0.0.1\nMYSQL_PORT=${config.port}\nMYSQL_USER=life_dashboard\nMYSQL_PASSWORD=${appPassword}\nMYSQL_DATABASE=life_dashboard\n`,{mode:0o600});
  }
  await connection.end();console.log(`本项目独立 MySQL 已就绪，端口 ${config.port}；未使用或更改原有 MySQL 数据。`);
}
