import {createAccounts} from '../server/accounts.mjs';import {claimLegacy} from '../server/legacy-claim.mjs';
if(!process.stdin.isTTY)throw Error('请在本机终端交互运行，不接受命令行密码');
process.stdout.write('为 legacy_owner 设置密码（至少10位，不显示输入）：');process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
let password='';try{password=await new Promise((resolve,reject)=>{const onData=chunk=>{for(const char of chunk){if(char==='\u0003'){process.stdin.off('data',onData);reject(Error('已取消'));return}if(char==='\r'||char==='\n'){process.stdin.off('data',onData);resolve(password);return}if(char==='\u007f'||char==='\b')password=password.slice(0,-1);else password+=char}};process.stdin.on('data',onData)})}finally{process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')}
const accounts=await createAccounts();try{await claimLegacy(accounts,password);password='';console.log('原有空间已启用，请使用 legacy_owner 登录。')}finally{await accounts.close()}
