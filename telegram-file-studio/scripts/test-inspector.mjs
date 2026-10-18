#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { inspectProject } from './inspect-studio.mjs';
function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-skill-test-'));
  try { return fn(dir); } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function configure(dir) {
  const token=['123456','SYNTHETIC_ONLY'].join(':');
  const hash='a'.repeat(32);
  fs.writeFileSync(path.join(dir,'.env'),['BOT_TOKEN='+token,'OWNER_ID=456','BOT_API_ROOT=http://127.0.0.1:8081',''].join('\r\n'));
  fs.writeFileSync(path.join(dir,'.telegram-api.env'),['TELEGRAM_API_ID=789','TELEGRAM_API_HASH='+hash,''].join('\r\n'));
  return {token,hash};
}
test('missing project yields a safe incomplete report',()=>fixture(dir=>{
  const r=inspectProject(path.join(dir,'absent'));
  assert.equal(r.projectExists,false);assert.equal(r.config.valid,false);assert.ok(r.missingFiles.length);
}));
test('valid CRLF credentials are checked but never printed',()=>fixture(dir=>{
  const {token,hash}=configure(dir),r=inspectProject(dir),out=JSON.stringify(r);
  assert.equal(r.config.valid,true);assert.ok(!out.includes(token));assert.ok(!out.includes(hash));
  assert.equal(r.readOnly,true);assert.equal(r.live,undefined);
}));
test('one-line settings regression is rejected without disclosing values',()=>fixture(dir=>{
  const {token}=configure(dir);fs.writeFileSync(path.join(dir,'.env'),'BOT_TOKEN='+token+' OWNER_ID=456 BOT_API_ROOT=http://127.0.0.1:8081');
  const r=inspectProject(dir);assert.equal(r.config.valid,false);assert.ok(!JSON.stringify(r).includes(token));
}));
test('duplicate keys are rejected',()=>fixture(dir=>{
  configure(dir);fs.appendFileSync(path.join(dir,'.env'),'OWNER_ID=456\n');
  assert.equal(inspectProject(dir).config.checks.uniqueKeys,false);
}));
test('non-loopback API endpoints are rejected',()=>fixture(dir=>{
  configure(dir);const file=path.join(dir,'.env');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('127.0.0.1','example.invalid'));
  assert.equal(inspectProject(dir).config.checks.loopbackApi,false);
}));
test('recorded evidence is distinguished from current source state',()=>fixture(dir=>{
  configure(dir);fs.mkdirSync(path.join(dir,'studio-v2'));fs.writeFileSync(path.join(dir,'bot.js'),'original');
  fs.writeFileSync(path.join(dir,'studio-v2','release.json'),JSON.stringify({version:'2.0.0',totalAutomatedChecks:89,
    liveTest:{resize:true,telegramUpload:true},sourceSha256:{'bot.js':createHash('sha256').update('original').digest('hex')}}));
  assert.equal(inspectProject(dir).sourceHashes[0].matchesRecordedRelease,true);
  fs.writeFileSync(path.join(dir,'bot.js'),'edited');
  const r=inspectProject(dir);assert.equal(r.sourceHashes[0].matchesRecordedRelease,false);
  assert.equal(r.recordedRelease.totalAutomatedChecks,89);assert.equal(r.live,undefined);
}));
test('release paths outside the project are not inspected',()=>fixture(dir=>{
  configure(dir);fs.mkdirSync(path.join(dir,'studio-v2'));
  fs.writeFileSync(path.join(dir,'studio-v2','release.json'),JSON.stringify({sourceSha256:{'../outside.txt':'a'.repeat(64)}}));
  assert.equal(inspectProject(dir).sourceHashes.length,0);
}));
