import { readFile } from "node:fs/promises";
const load=(path)=>readFile(new URL(path,import.meta.url),"utf8").then(JSON.parse);
const [coverage,claims,envelope,adapter,inventory]=await Promise.all([
  load("../config/base_lab_domain_coverage_matrix.json"),
  load("../config/base_enterprise_agent_asset_operations_claim_matrix.json"),
  load("../config/canonical-business-event-envelope.schema.json"),
  load("../config/erp-adapter-public-contract.json"),
  load("../fixtures/catverse_base_inventory_vertical_slice.json")
]);
const assert=(value,message)=>{if(!value) throw new Error(message)};
assert(coverage.domains.length===14,"D01-D14 coverage must contain 14 domains");
assert(new Set(coverage.domains.map((item)=>item.id)).size===14,"domain IDs must be unique");
assert(claims.claims.some((item)=>item.id==="BASE-EAOP-C07"&&item.status==="missing_p0"),"independent payer gap must stay explicit");
assert(envelope.properties.namespace.const==="ABL","canonical namespace must be ABL");
assert(adapter.guards.allow_erp_write===false&&adapter.guards.submit===false,"ERP write and submit must remain disabled");
assert(inventory&&typeof inventory==="object","CATVERSE inventory fixture must parse");
console.log(JSON.stringify({status:"passed",domains:14,claims:claims.claims.length,erp_write:false,namespace:"ABL"}));
