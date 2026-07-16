#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const args = Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith("--"))a.push([v.slice(2),all[i+1]]);return a;},[]));
if (!args.data || !args.module) {
  console.error("Usage: node tools/wow-import/import-wow.mjs --data data.zip --module ac_diagnosis_module.zip --out public/delphi/wow");
  process.exit(1);
}
const out = resolve(args.out || "public/delphi/wow");
const work = join(tmpdir(), `wow-import-${Date.now()}`);
const dataDir = join(work,"data"); const moduleDir=join(work,"module");
mkdir(dataDir,{recursive:true}); mkdir(moduleDir,{recursive:true}); mkdir(out,{recursive:true});
execFileSync("unzip",["-oq",resolve(args.data),"-d",dataDir]);
execFileSync("unzip",["-oq",resolve(args.module),"-d",moduleDir]);

async function walk(dir){const result=[];for(const n of await readdir(dir)){const p=join(dir,n);const s=await stat(p);s.isDirectory()?result.push(...await walk(p)):result.push(p);}return result;}
const files=[...(await walk(dataDir)).map(p=>({archive:basename(args.data),root:dataDir,path:p})),...(await walk(moduleDir)).map(p=>({archive:basename(args.module),root:moduleDir,path:p}))];
const inventory=[];
for(const f of files){const b=await readFile(f.path);inventory.push({archive:f.archive,path:relative(f.root,f.path).replaceAll("\\","/"),size:b.length,extension:extname(f.path).toLowerCase(),sha256:createHash("sha256").update(b).digest("hex")});}
await writeFile(join(out,"source-inventory.json"),JSON.stringify({schemaVersion:1,fileCount:inventory.length,files:inventory},null,2));

const csv=files.find(f=>basename(f.path).toLowerCase()==="mid_prot_overview.csv");
if(!csv) throw new Error("mid_prot_overview.csv not found");
const text=await readFile(csv.path,"latin1");
const names=["startYear","systemName","systemVariant","gearbox","unknown04","measurementProtocol","eobdProtocol","diagnosisProtocol","unknown08","blinkProtocol","obdProtocol","ecuObd","parallelProtocol","ecuParallel","systemType","endYear","descriptionId","systemDescriptionId","ecuDescriptionId","devices","brandId","modelId"];
const records=text.split(/\r?\n/).filter(Boolean).map((line,i)=>{const c=line.split(";");const r=Object.fromEntries(names.map((n,j)=>[n,c[j]??""]));const proto=(r.obdProtocol||r.eobdProtocol||r.diagnosisProtocol||"").toLowerCase();let elmSupport="metadata_only";let transportHint="unknown";if(proto.includes("eobd")||r.ecuObd.toLowerCase()==="9j1962"){elmSupport="candidate_requires_validation";transportHint="obd2_or_oem";}if(/vpw|pwm|blink|parallel/.test(proto)){elmSupport="not_for_elm_without_validation";transportHint="legacy_or_proprietary";}return {...r,id:`wow-mid-${i+1}`,sourceFile:relative(moduleDir,csv.path).replaceAll("\\","/"),raw:c,transportHint,elmSupport};});
await writeFile(join(out,"protocol-overview.json"),JSON.stringify({schemaVersion:2,generatedFrom:[basename(args.data),basename(args.module)],recordCount:records.length,records}));
console.log(`Imported ${records.length} protocol overview records and inventoried ${inventory.length} files into ${out}`);
