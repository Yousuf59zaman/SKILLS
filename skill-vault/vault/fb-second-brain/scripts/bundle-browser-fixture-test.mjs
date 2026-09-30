import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureBrowser, connectBrowser, runOpenClaw, parseJsonOutput } from './browser-runtime.mjs';
import { createMessengerIO, findPageByTargetId } from './drain-messenger-queue.mjs';
import { captureConversationEvidence } from './messenger-evidence.mjs';
import { deliverBundle } from './bundle-sender.mjs';
import { prepareDrop } from './prepare-drop.mjs';

// A real renderer and real file chooser in ONE owned about:blank tab. All
// network is blocked on this page; this test never opens/sends to Messenger.
const html = `<!doctype html><meta charset="utf-8"><style>img{width:90px;height:90px} [contenteditable]{min-height:50px;border:1px solid} #draft{padding:20px}</style>
<main role="main"><div role="log"></div><div id="draft"><input type="file" multiple><div id="previews"></div><div role="textbox" contenteditable="true" aria-label="Write to meme boi"></div><button aria-label="Send">Send</button></div></main>
<script>
(()=>{
window.sentCount=0; window.fixtureFault=''; window.stagedFiles=[];
const input=document.querySelector('input'),previews=document.querySelector('#previews'),composer=document.querySelector('[role=textbox]');
input.addEventListener('change',()=>{window.stagedFiles=Array.from(input.files);previews.replaceChildren();window.stagedFiles.forEach((file,i)=>{if(window.fixtureFault==='partial-upload'&&i>0)return;const button=document.createElement('button');button.setAttribute('aria-label','Remove attachment '+file.name);button.textContent='Remove';button.onclick=()=>button.remove();previews.append(button);});if(window.fixtureFault==='reset-file-input')input.value='';});
document.querySelector('[aria-label=Send]').addEventListener('click',(event)=>{
 if(!window.fixtureFault.startsWith('modern-'))return;
 event.stopImmediatePropagation();window.sentCount++;
 const log=document.querySelector('[role=log]');
 const article=(id,byYou,outgoing)=>{const row=document.createElement('div');row.setAttribute('role','article');row.setAttribute('data-message-id',id);const controls=document.createElement('div');controls.setAttribute('role','presentation');controls.style.display='flex';controls.style.flexDirection=outgoing?'row-reverse':'row';const toolbar=document.createElement('div');toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Message actions');controls.append(toolbar);row.append(controls);const reply=document.createElement('button');reply.setAttribute('aria-label','Reply to message sent 6:31 PM by '+(byYou?'you':'fixture caption'));row.append(reply);log.append(row);return row;};
 const textRow=article('modern-caption',false,window.fixtureFault!=='modern-incoming');
 const caption=document.createElement('div');caption.setAttribute('dir','auto');caption.textContent=(window.fixtureFault==='modern-incoming'?'You sent ':'')+composer.innerText;textRow.append(caption);
 const preview=document.createElement('a');preview.href=window.fixtureFault==='modern-link'?'https://www.facebook.com/photo.php?fbid=preview-only':'https://www.facebook.com/share/r/synthetic-fixture/';const thumbnail=document.createElement('img');thumbnail.src=window.stagedFiles.length?URL.createObjectURL(window.stagedFiles[0]):'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCekAAAAASUVORK5CYII=';preview.append(thumbnail);textRow.append(preview);
 if(window.fixtureFault==='modern-link'){textRow.querySelector('button').remove();composer.textContent='';previews.replaceChildren();input.value='';return;}
 const album=article('modern-album',true,true);
 window.stagedFiles.forEach((file,i)=>{const link=document.createElement('a');link.setAttribute('aria-label','Open photo '+(i+1));link.href='https://www.facebook.com/messenger_media/?attachment_id=fixture-'+i+'&message_id=fixture-message&thread_id=fixture-thread&temporary_signature=before';const img=document.createElement('img');img.src=URL.createObjectURL(file);link.append(img);album.append(link);});
 composer.textContent='';previews.replaceChildren();input.value='';
},true);
document.querySelector('[aria-label=Send]').onclick=()=>{window.sentCount++;const row=document.createElement('div');if(window.fixtureFault!=='presentation'){row.setAttribute('role','row');row.setAttribute('aria-label','You sent');}else{const reply=document.createElement('button');reply.setAttribute('aria-label','Reply to message sent at 12:00 by you');row.append(reply);}row.setAttribute('data-message-id','fixture-'+window.sentCount);const caption=document.createElement('div');caption.textContent=window.fixtureFault==='missing-caption'?'':composer.innerText;row.append(caption);window.stagedFiles.forEach((file,i)=>{if(window.fixtureFault==='partial-delivery'&&i>0)return;const img=document.createElement('img');img.alt='Photo';img.src=URL.createObjectURL(file);row.append(img);});const status=document.createElement(window.fixtureFault==='presentation'?'img':'span');if(window.fixtureFault==='presentation'){status.alt='Sent';status.style.width='16px';status.style.height='16px';}else{status.setAttribute('aria-label',window.fixtureFault==='sending-only'?'Sending':['narration-only','persisted-no-status'].includes(window.fixtureFault)?'':'Sent');}row.append(status);document.querySelector('[role=log]').append(row);composer.textContent='';previews.replaceChildren();input.value='';};
})();
</script>`;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-bundle-browser-sqa-'));
const failures = [];
let total = 0, browser, page, targetId;
async function test(name, run) { total++; try { await run(); } catch(error) { failures.push({name, error: error.message.split('\n')[0]}); } }
try {
  const status = await ensureBrowser('openclaw', { start: true, timeoutMs: 60000 });
  const opened = runOpenClaw(['browser', '--json', '--browser-profile', 'openclaw', 'open', 'about:blank']);
  targetId = parseJsonOutput(opened.stdout, 'fixture-owned-tab').targetId;
  assert.match(String(targetId), /^[A-Fa-f0-9]{16,64}$/);
  const connection = await connectBrowser(status.cdpUrl);
  browser = connection.browser;
  page = await findPageByTargetId(connection.context, targetId);
  assert.ok(page, 'fixture owned target not found');
  const untouched = connection.context.pages().filter((p) => p !== page).map((p)=>({page:p,url:p.url()}));
  await page.route('**/*', (route) => route.abort());
  const files = [];
  for (let n=0;n<10;n++) { const file=path.join(root, `fixture-${n}.png`); await fs.writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCekAAAAASUVORK5CYII=', 'base64')); files.push(file); }
  for (const count of [0,4,6,10]) {
    const faults = count === 0 ? ['', 'presentation', 'persisted-no-status', 'missing-caption', 'narration-only', 'sending-only', 'modern-link'] : ['', 'presentation', 'reset-file-input', 'persisted-no-status', 'partial-upload', 'partial-delivery', 'missing-caption', 'narration-only', 'sending-only', 'modern-split', 'modern-incoming', 'modern-partial-persistence'];
    for (const fault of faults) {
      await test(`real renderer ${count} attachments ${fault || 'complete'}: no external send`, async()=>{
        await page.setContent(html);
        if(count===0) await page.locator('input[type="file"]').evaluate(el=>el.remove());
        await page.evaluate((value)=>{window.fixtureFault=value;},fault);
        const workspace=path.join(root, `case-${count}-${fault || 'complete'}`);
        await fs.mkdir(path.join(workspace,'memory'),{recursive:true});
        const job=await prepareDrop({workspace,category:'funny',memory_file:'memory/funny-posts.md',type:'image',attachment_paths:files.slice(0,count),text:'স্মৃতি একসাথে\nCaption second line\nhttps://example.org/one\nhttps://example.org/two',source:'Telegram'});
        assert.equal(job.status,'queued');
        const handoff=job.post_manifest.browser_handoff;
        const io=createMessengerIO(page,handoff,page.getByRole('textbox',{name:'Write to meme boi',exact:true}));
        const draftCapture=io.draft; let lastDraft;
        io.draft=async()=>{lastDraft=await draftCapture();return lastDraft;};
        const capture=io.history;
        io.history=async()=>{const evidence=await capture(); assert.equal(evidence.messengerConversation,false,'fixture must NOT have a Facebook origin'); return {...evidence,host:'www.facebook.com',path:'/messages/t/synthetic-fixture',messengerConversation:true};};
        io.reloadHistory=async()=>({...await io.history(),rows:[]}); // Only explicit persistence fixtures survive a simulated reload.
        if(fault==='persisted-no-status') io.reloadHistory=async()=>io.history();
        if(fault==='narration-only') io.reloadHistory=async()=>({...await io.history(),rows:[]});
        if(fault.startsWith('modern-')) io.reloadHistory=async()=>{
          await page.evaluate((partial)=>{for(const link of document.querySelectorAll('a[aria-label^="Open photo"]')){const url=new URL(link.href);url.searchParams.set('temporary_signature','after');link.href=url.href;}if(window.fixtureFault==='modern-link'){const reply=document.createElement('button');reply.setAttribute('aria-label','Reply to message sent 6:31 PM by fixture caption');reply.textContent='Newly hydrated narration';document.querySelector('[data-message-id="modern-caption"]').append(reply);}if(partial)document.querySelector('[data-message-id="modern-album"] img')?.remove();},fault==='modern-partial-persistence');
          return io.history();
        };
        let clock=0; io.now=()=>clock; io.sleep=async(ms)=>{clock+=ms;await page.waitForTimeout(10);};
        let markers=0,caught,result;
        try { result=await deliverBundle(handoff,io,async()=>{markers++;}); } catch(error) {caught=error;}
        const sends=await page.evaluate(()=>window.sentCount);
        if(!fault || fault==='presentation' || fault==='reset-file-input' || fault==='persisted-no-status'||fault==='modern-split'||fault==='modern-link'){if(caught)console.log(JSON.stringify({fixture:count,composerPresent:lastDraft?.composerPresent,textMatches:lastDraft?.textMatches,attachmentCount:lastDraft?.attachmentCount,fileCount:lastDraft?.files?.length,uploadBusy:lastDraft?.uploadBusy,uploadFailed:lastDraft?.uploadFailed}));assert.equal(caught,undefined,caught?.message);assert.equal(result.delivery_receipt.attachment_count,count);assert.equal(sends,1);assert.equal(markers,1);if(['persisted-no-status','modern-split','modern-link'].includes(fault))assert.match(result.note,/server-persisted/);}
        else {assert.ok(caught);assert.equal(sends,fault==='partial-upload'?0:1);assert.equal(Boolean(caught.sendAttempted),fault!=='partial-upload');}
      });
    }
  }
  await test('other browser tabs remain open and untouched', async()=>{assert.ok(untouched.every((entry)=>!entry.page.isClosed()&&entry.page.url()===entry.url));});
} finally {
  if(page) await page.close().catch(()=>{});
  else if(targetId) runOpenClaw(['browser','--browser-profile','openclaw','close',String(targetId)],{allowFailure:true});
  if(browser) await browser.close(); // CDP disconnect only, not Chrome shutdown.
  assert.ok(root.startsWith(path.join(os.tmpdir(),'fb-bundle-browser-sqa-')));
  await fs.rm(root,{recursive:true,force:true});
}
const stillRunning=await ensureBrowser('openclaw',{start:false,timeoutMs:30000});
assert.ok(stillRunning.cdpUrl,'managed browser remains alive after disconnect');
console.log(JSON.stringify({ok:!failures.length,total,passed:total-failures.length,failed:failures.length,externalMessagesSent:0,managedBrowserPreserved:true,failures}));
if(failures.length)process.exitCode=1;
