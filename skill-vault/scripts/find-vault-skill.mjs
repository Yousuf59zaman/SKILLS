import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const defaultRoot=path.resolve(HERE,'..','..');
const stop=new Set(['the','and','for','with','this','that','please','skill','skills','use','amr','amar','ami','koro','ki','to','of','a','an']);
const tokens=s=>[...new Set((String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1&&!stop.has(t)))];
export function metadata(text){
 const body=String(text).replace(/^\uFEFF/,'').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
 if(!body)return null;
 const lines=body.split(/\r?\n/),result={};
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^(name|description):\s*(.*)$/);if(!m)continue;
  let value=m[2].trim();
  if(/^[>|][+-]?$/.test(value)){const parts=[];while(i+1<lines.length&&/^\s+\S/.test(lines[i+1]))parts.push(lines[++i].trim());value=parts.join(' ');}
  else if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  result[m[1]]=value;
 }
 return result.name&&result.description?result:null;
}
export function discover(root=defaultRoot){
 const absolute=path.resolve(root);if(!fs.existsSync(absolute)||!fs.statSync(absolute).isDirectory())throw new Error('Skill root is unavailable.');
 const found=[];
 for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink()||entry.name.startsWith('.')||entry.name==='skill-vault')continue;
  const folder=path.join(absolute,entry.name),file=path.join(folder,'SKILL.md');
  try{if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())continue;
   const data=metadata(fs.readFileSync(file,'utf8'));if(data)found.push({Name:data.name,Folder:entry.name,Description:data.description,Path:folder,SkillFile:file});
  }catch{/* An unreadable unrelated sibling must not break the entire router. */}
 }
 return found.sort((a,b)=>a.Name.localeCompare(b.Name));
}
export function search(root,query,top=8){
 if(!Number.isInteger(top)||top<1||top>50)throw new Error('Top must be an integer between 1 and 50.');
 const words=tokens(query);if(!words.length)return [];
 const q=String(query).trim().toLowerCase();
 return discover(root).map(item=>{
  const name=item.Name.toLowerCase(),nt=new Set(tokens(name+' '+item.Folder)),dt=new Set(tokens(item.Description));
  let score=q===name||q===item.Folder.toLowerCase()?100:0;
  for(const word of words){if(nt.has(word))score+=10;else if(dt.has(word))score+=2;}
  return {Score:score,...item};
 }).filter(x=>x.Score>0).sort((a,b)=>b.Score-a.Score||a.Name.localeCompare(b.Name)).slice(0,top);
}
function main(args){
 let root=defaultRoot,query='',top=8,json=false;
 for(let i=0;i<args.length;i++){
  const a=args[i];const value=()=>{if(i+1>=args.length)throw new Error('Missing option value.');return args[++i];};
  if(a==='--root')root=value();else if(a==='--query')query=value();else if(a==='--top')top=Number(value());else if(a==='--json')json=true;
  else if(a==='--help'){console.log('Read-only: node find-vault-skill.mjs --query <keywords> [--top 8] [--root <skills-directory>] [--json]');return;}
  else throw new Error('Unknown option. Use --help.');
 }
 if(!query.trim())throw new Error('Provide --query with a workflow name or keywords.');
 const result=search(root,query,top);
 if(json)console.log(JSON.stringify(result,null,2));else if(result.length)for(const item of result)console.log(`${item.Name} (${item.Score})\n${item.Description}\n${item.SkillFile}\n`);
 else console.log('No matching top-level skill found.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
