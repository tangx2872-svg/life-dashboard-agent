import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {fixture} from './helpers.mjs';
test('Voice session replaces interim revisions, stops explicitly and never auto parses',{skip:!process.env.BROWSER_MODULE},async()=>{
 const f=await fixture();const {chromium}=await import(pathToFileURL(process.env.BROWSER_MODULE));const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const p=await b.newPage();await p.goto(f.url+'/#/aiCapture');await p.waitForFunction(()=>window.dashboardReady);
 await p.evaluate(()=>{window.SpeechRecognition=class{constructor(){window.voiceMock=this}start(){}stop(){this.onend()}};captureUI.text='原有文字';render()});
 await p.getByRole('button',{name:'● 开始语音输入',exact:true}).click();assert.equal(await p.getByRole('button',{name:'整理为行动',exact:true}).isDisabled(),true);
 await p.evaluate(()=>{for(const text of ['我想','我想去杭州','我想去杭州玩'])voiceMock.onresult({results:[[{transcript:text}]]})});
 assert.equal(await p.locator('#product-capture-text').inputValue(),'原有文字\n我想去杭州玩');await p.getByRole('button',{name:'■ 结束录音',exact:true}).click();assert.equal(await p.getByRole('button',{name:'整理为行动',exact:true}).isEnabled(),true);assert.equal((await f.store.read()).revision,0);
 await p.getByRole('button',{name:'● 开始语音输入',exact:true}).click();await p.evaluate(()=>voiceMock.onresult({results:[[{transcript:'第二段'}]]}));await p.getByRole('button',{name:'■ 结束录音',exact:true}).click();assert.equal(await p.locator('#product-capture-text').inputValue(),'原有文字\n我想去杭州玩\n第二段');
 }finally{await b.close();await f.close()}
});
