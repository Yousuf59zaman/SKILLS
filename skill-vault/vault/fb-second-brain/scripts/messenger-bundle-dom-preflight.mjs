import assert from 'node:assert/strict';
import { ensureBrowser, connectBrowser, runOpenClaw, parseJsonOutput } from './browser-runtime.mjs';
import { findPageByTargetId, openExactConversation } from './drain-messenger-queue.mjs';
import { captureConversationEvidence } from './messenger-evidence.mjs';

// READ ONLY: no queue claim, upload, typing, send, login or credential access.
let browser, page, targetId;
let result = { ok: false, externalMessagesSent: 0, queueClaimed: false };
try {
  const status = await ensureBrowser('openclaw', { start: false, timeoutMs: 60000 });
  const opened = runOpenClaw(['browser', '--json', '--browser-profile', 'openclaw', 'open', 'https://www.facebook.com/messages/']);
  targetId = parseJsonOutput(opened.stdout, 'owned-dom-preflight').targetId;
  assert.match(String(targetId), /^[A-Fa-f0-9]{16,64}$/);
  const connection = await connectBrowser(status.cdpUrl);
  browser = connection.browser;
  page = await findPageByTargetId(connection.context, targetId);
  assert.ok(page);
  await page.waitForLoadState('domcontentloaded');
  await openExactConversation(page, 'meme boi');
  await page.waitForTimeout(3000);
  const evidence = await captureConversationEvidence(page, '');
  const structure = await page.evaluate(() => {
    const main = document.querySelector('[role="main"]') || document.body;
    return Array.from(main.querySelectorAll('[role="log"], [role="grid"], [role="list"]')).map((el) => ({ role: el.getAttribute('role'), visible: el.getBoundingClientRect().height > 0, children: el.children.length, rows: el.querySelectorAll('[role="row"]').length, listItems: el.querySelectorAll('[role="listitem"]').length, images: el.querySelectorAll('img').length, messageLabel: /message|chat|conversation/i.test(el.getAttribute('aria-label') || ''), parentRole: el.parentElement?.getAttribute('role') || '' }));
  });
  const boundaries = await page.evaluate(() => {
    const log = Array.from(document.querySelectorAll('[role="log"]')).at(-1);
    if (!log) return null;
    const kind = (value) => /^You sent/i.test(value) ? 'you_sent' : /^(sent|delivered|seen)(\b|$)/i.test(value) ? 'ack' : /photo|image|picture/i.test(value) ? 'image' : /message|chat|conversation/i.test(value) ? 'message' : 'other';
    const chain = (node) => { const result=[]; for(let level=0;node && node!==log && level<14;level++,node=node.parentElement) {const css=getComputedStyle(node); result.push({tag:node.tagName,role:node.getAttribute('role')||'',attributes:node.getAttributeNames().filter((name)=>name!=='class'&&name!=='style'),labelKind:kind(node.getAttribute('aria-label')||''),children:node.children.length,hasYouSent:/You sent/i.test(node.textContent||''),display:css.display,direction:css.flexDirection,align:css.alignItems,self:css.alignSelf,justify:css.justifyContent});}return result;};
    const media=Array.from(log.querySelectorAll('img')).filter((el)=>el.getBoundingClientRect().width>=48).slice(0,3).map(chain);
    const narration=Array.from(log.querySelectorAll('h1,h2,h3,h4,h5,h6,[aria-label]')).filter((el)=>/^You sent/i.test(el.getAttribute('aria-label')||el.textContent||'')).slice(0,3).map(chain);
    const labels=Array.from(log.querySelectorAll('[aria-label]')).reduce((result,el)=>{const key=kind(el.getAttribute('aria-label')||'');result[key]=(result[key]||0)+1;return result;},{});
    const allowed=new Set('you your sent send delivered seen sending message messages by from incoming outgoing photo image attachment file view open reply react forward more options timestamp removed edited today unread like love'.split(' '));
    const templates=[...new Set(Array.from(log.querySelectorAll('[aria-label]')).map((el)=>(el.getAttribute('aria-label')||'').split(/\s+/).map((word)=>allowed.has(word.toLowerCase())?word.toLowerCase():'_').join(' ')))];
    const top=[];let layer=[log];for(let depth=0;depth<5;depth++){const next=layer.flatMap(el=>Array.from(el.children));top.push({depth,nodes:next.length,childCounts:next.slice(0,20).map(el=>el.children.length),tabbed:next.filter(el=>el.hasAttribute('tabindex')).length});layer=next;}
    const terminalHints=Array.from(log.querySelectorAll('[alt],[title],svg title')).flatMap(el=>[el.getAttribute('alt')||'',el.getAttribute('title')||'',el.tagName==='title'?el.textContent:'']).filter(value=>/^(?:sent|delivered|seen|sending)(?:$|\s+(?:by|at|on)\b)/i.test(value)).map(value=>value.split(' ')[0].toLowerCase());
    return {media:media.slice(1,2),narration,labels,templates,top,terminalHints};
  });
  result = { ...result, ok: evidence.messengerConversation && evidence.composerPresent && evidence.rows.length > 0, structuralVersion: evidence.version, conversationRecognized: evidence.messengerConversation, composerRecognized: evidence.composerPresent, visibleRows: evidence.rows.length, outgoingRows: evidence.rows.filter((row)=>row.outgoing).length, acknowledgedRows: evidence.rows.filter((row)=>row.delivered).length, recognizedAttachments: evidence.rows.reduce((sum,row)=>sum+row.attachmentCount,0), ...(process.argv.includes('--structure') ? {structure,boundaries} : {}) };
} catch {
  result.error = 'read_only_messenger_dom_preflight_failed';
} finally {
  if(page) await page.close().catch(()=>{});
  else if(targetId) runOpenClaw(['browser','--browser-profile','openclaw','close',String(targetId)],{allowFailure:true});
  if(browser) await browser.close().catch(()=>{});
}
console.log(JSON.stringify(result));
if(!result.ok)process.exitCode=1;
