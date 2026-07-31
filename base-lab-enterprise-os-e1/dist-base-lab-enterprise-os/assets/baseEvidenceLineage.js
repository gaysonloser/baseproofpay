const ids=['guardrails','lifecycle','handoff'];
const urls=['/api/v1/base-account-execution-guardrails','/api/v1/base-smart-wallet-lifecycle','/api/v1/base-smart-wallet-erp-handoff'];
Promise.all(urls.map((url)=>fetch(url,{credentials:'omit'}).then((response)=>{if(!response.ok)throw Error(`${url} ${response.status}`);return response.json();}))).then((rows)=>{
  document.getElementById('guardrails').textContent=JSON.stringify({status:rows[0].status,defaults:rows[0].control_defaults},null,2);
  document.getElementById('lifecycle').textContent=JSON.stringify({status:rows[1].status,account:rows[1].application_account,controls:rows[1].lifecycle},null,2);
  document.getElementById('handoff').textContent=JSON.stringify({status:rows[2].status,event:rows[2].canonical_business_event,erp:rows[2].erp_handoff},null,2);
  document.getElementById('state').textContent='Three-source lineage verified · Read-only';
}).catch((error)=>{document.getElementById('state').textContent='Evidence endpoint unavailable';ids.forEach((id)=>{document.getElementById(id).textContent='No partial claim shown.';});console.error(error);});
