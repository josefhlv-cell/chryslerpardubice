#!/usr/bin/env node
/**
 * Heuristický scanner. Nevytváří automaticky spustitelné funkce.
 * Použití: node tools/wow-import/extract-service-candidates.mjs --source /path/to/extracted/WOW --out public/delphi/wow
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const argv=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,x)=>{if(v.startsWith("--"))a.push([v.slice(2),x[i+1]]);return a},[]));
if(!argv.source||!argv.out) throw new Error("Použij --source a --out");
const interesting=/(protocols(?:_info)?|scan_protocols|ai_protocols|expertmode|confirms|resources?)/i;
const service=/(adapt|activation|actuator|regener|coding|program|calibr|learn|reset|bleed|pump|egr|dpf|inject|throttle|service)/i;
const hex=/(?<![0-9a-f])(?:[0-9a-f]{2}[\s,:;\-]+){1,15}[0-9a-f]{2}(?![0-9a-f])/ig;
async function walk(d){let r=[];for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);r.push(...(e.isDirectory()?await walk(p):[p]));}return r}
const items=[];
for(const file of await walk(argv.source)){if(!interesting.test(file))continue;const st=await fs.stat(file);if(st.size>12e6)continue;const b=await fs.readFile(file);const text=b.toString("latin1").replace(/\x00/g,"");for(const m of text.matchAll(hex)){const requestCandidate=[...m[0].matchAll(/[0-9a-f]{2}/ig)].map(x=>x[0].toUpperCase()).join(" ");const from=Math.max(0,m.index-300),to=Math.min(text.length,m.index+600),context=text.slice(from,to).replace(/[^\x20-\x7e]/g," ");items.push({id:crypto.createHash("sha1").update(file+String(m.index)+requestCandidate).digest("hex").slice(0,20),sourceFile:path.relative(argv.source,file),offset:m.index,kind:"hex_sequence_candidate",requestCandidate,context:service.test(context)?[context]:[],confidence:0.25,verificationStatus:"unverified",executable:false,reason:"Heuristický kandidát bez potvrzené ECU a odpovědi."});}}
await fs.mkdir(argv.out,{recursive:true});await fs.writeFile(path.join(argv.out,"service-definition-candidates.json"),JSON.stringify({summary:{candidateCount:items.length,executableVerifiedCount:0},items}));console.log(`Candidates: ${items.length}`);
