import { readFile } from "node:fs/promises";

const load=(path)=>readFile(new URL(path,import.meta.url),"utf8").then(JSON.parse);
const ecosystem=await load("../config/base_lab_ecosystem_evidence.json");
const entries=Object.fromEntries(ecosystem.entries.map((item)=>[item.id,item]));
const assert=(value,message)=>{if(!value) throw new Error(message);};

assert(entries.base_dashboard_app.status==="verified","Base Dashboard App must be verified");
assert(entries.builder_code.status==="verified","Builder Code must be verified");
assert(entries.verified_contracts.status==="verified","Base contracts must be verified");
assert(entries.talent_project.status==="indexed_aggregate","Talent aggregate must not become adoption");
assert(entries.base_dev_indexing.status==="pending_refresh","Base.dev must remain pending until read back");
assert(entries.base_builders.status==="handoff_in_progress_not_submitted","Builders nomination must remain handed off but unsubmitted");
assert(entries.independent_adoption.status==="missing_p0","Independent adoption gap must remain explicit");
assert(ecosystem.external_writes===0&&ecosystem.wallet_actions===0&&ecosystem.chain_actions===0,"Local ecosystem proof cannot create external actions");

console.log(JSON.stringify({status:"passed",entries:ecosystem.entries.length,builder_code:entries.builder_code.value,talent:entries.talent_project.status,base_dev:entries.base_dev_indexing.status,adoption:entries.independent_adoption.status}));
