import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultStaticRoot = join(projectRoot, "dist-base-lab-enterprise-os");
const evidencePath = join(projectRoot, "outputs/base_lab_enterprise_os_latest.json");
const topologyPath = join(projectRoot, "config/base_lab_cloud_runtime_topology.json");
const ecosystemPath = join(projectRoot, "config/base_lab_ecosystem_evidence.json");
const controlReadinessPath = join(projectRoot, "outputs/base_lab_control_readiness_latest.json");
const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
const securityHeaders = {
  "content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests",
  "strict-transport-security":"max-age=31536000; includeSubDomains",
  "x-frame-options":"DENY",
  "referrer-policy":"no-referrer",
  "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-content-type-options":"nosniff",
  "cross-origin-resource-policy":"same-origin",
  "cross-origin-opener-policy":"same-origin",
  "vary":"Origin"
};

function assertRuntime(env) {
  const mode = env.BASE_LAB_RUNTIME_MODE || "local_preview";
  const origin = env.BASE_LAB_CONSOLE_ORIGIN || "";
  if (origin) {
    if (!origin.startsWith("https://")) throw new Error("Configured Console origin must use HTTPS");
    if (/localhost|127\.0\.0\.1/.test(origin)) throw new Error("Configured Console origin cannot be local");
  }
  return {mode,originConfigured:Boolean(origin)};
}

function sendJson(req, res, status, value, extraHeaders={}) {
  res.writeHead(status,{...securityHeaders,"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extraHeaders});
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(value));
}

export function sanitizeEvidence(evidence) {
  return {
    schema_version:evidence.schema_version,
    evidence_id:evidence.evidence_id,
    generated_at:evidence.generated_at,
    status:evidence.status,
    product:evidence.product,
    coverage:evidence.coverage,
    modules:(evidence.modules || []).map(({id,domain,status,business_event_id})=>({id,domain,status,business_event_id})),
    controls:evidence.controls,
    gates:evidence.gates,
    evidence_root:evidence.evidence_root,
    chain_anchor:evidence.chain_anchor ? {
      status:evidence.chain_anchor.status,
      network:evidence.chain_anchor.network,
      registry:evidence.chain_anchor.registry,
      transaction_hash:evidence.chain_anchor.transaction_hash,
      evidence_id:evidence.chain_anchor.evidence_id,
      business_event_id:evidence.chain_anchor.business_event_id,
      evidence_root:evidence.chain_anchor.evidence_root,
      builder_code:evidence.chain_anchor.builder_code,
      value_eth:evidence.chain_anchor.value_eth,
      asset_movement:evidence.chain_anchor.asset_movement
    } : null
  };
}

export function sanitizeTopology(topology) {
  return {
    topology_id:topology.topology_id,
    status:topology.status,
    current_label:topology.career_deployment_review.current_label,
    zones:[
      {id:"local_build",role:"deterministic build, test, and preview",production:false},
      {id:"managed_console",role:"HTTPS static UI and GET/HEAD-only sanitized APIs",production:true,durable_control_plane:false},
      {id:"managed_erp",role:"authoritative ERP ledger",adapter:"external_only"},
      {id:"reviewer_ui",role:"read-only evidence review",wallet:false,erp_write:false}
    ],
    request_flow:topology.request_flow,
    deployment_gates:topology.deployment_gates
  };
}

export function sanitizeEcosystem(ecosystem) {
  return {
    schema_version:ecosystem.schema_version,
    evidence_id:ecosystem.evidence_id,
    as_of:ecosystem.as_of,
    product:ecosystem.product,
    rail:ecosystem.rail,
    entries:(ecosystem.entries || []).map(({id,label,status,value,url,secondary_url,boundary})=>({id,label,status,value,url,secondary_url,boundary})),
    official_sources:ecosystem.official_sources,
    external_writes:ecosystem.external_writes,
    wallet_actions:ecosystem.wallet_actions,
    chain_actions:ecosystem.chain_actions
  };
}

export function sanitizeControlReadiness(readiness) {
  return {
    schema_version: readiness.schema_version,
    evidence_id: readiness.evidence_id,
    generated_at: readiness.generated_at,
    product: readiness.product,
    company: readiness.company,
    overall_status: readiness.overall_status,
    sequence: readiness.sequence,
    lanes: (readiness.lanes || []).map(({ id, label, status, decision, facts, controls, blocker }) => ({ id, label, status, decision, facts, controls, blocker })),
    controls: readiness.controls,
    evidence_fingerprint: readiness.evidence_fingerprint
  };
}

export function createBaseLabConsoleServer({env=process.env,staticRoot=defaultStaticRoot}={}) {
  const runtime = assertRuntime(env);
  const requests = new Map();
  const limit = Math.max(1,Number(env.BASE_LAB_RATE_LIMIT_PER_MINUTE || 120));
  return createHttpServer(async (req,res) => {
    try {
      const now=Date.now();
      const key=req.socket.remoteAddress || "unknown";
      const prior=requests.get(key);
      const window=prior && now-prior.startedAt<60000 ? prior : {startedAt:now,count:0};
      window.count+=1;
      requests.set(key,window);
      if(window.count>limit) return sendJson(req,res,429,{error:"rate_limited"},{"retry-after":String(Math.max(1,Math.ceil((60000-(now-window.startedAt))/1000)))});
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(req,res,405,{error:"read_only_runtime"},{allow:"GET, HEAD"});
      if (req.url === "/healthz") return sendJson(req,res,200,{status:"ok",runtime_mode:runtime.mode,origin_configured:runtime.originConfigured,erp_authority:"managed_erp",wallet:false,writes:false,durable_control_plane:false});
      if (req.url === "/api/v1/evidence") return sendJson(req,res,200,sanitizeEvidence(JSON.parse(await readFile(evidencePath,"utf8"))));
      if (req.url === "/api/v1/ecosystem") return sendJson(req,res,200,sanitizeEcosystem(JSON.parse(await readFile(ecosystemPath,"utf8"))));
      if (req.url === "/api/v1/control-readiness") return sendJson(req,res,200,sanitizeControlReadiness(JSON.parse(await readFile(controlReadinessPath,"utf8"))));
      if (req.url === "/api/v1/topology") {
        const topology=JSON.parse(await readFile(topologyPath,"utf8"));
        return sendJson(req,res,200,sanitizeTopology(topology));
      }
      const rawPath = req.url === "/" ? "/enterprise-os.html" : req.url.split("?")[0];
      const safePath = normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/,"");
      const filePath = join(staticRoot,safePath);
      if (!filePath.startsWith(staticRoot)) return sendJson(req,res,403,{error:"invalid_path"});
      await stat(filePath);
      const body=await readFile(filePath);
      res.writeHead(200,{...securityHeaders,"content-type":types[extname(filePath)]||"application/octet-stream","cache-control":"public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      res.end(body);
    } catch {
      sendJson(req,res,404,{error:"not_found"});
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host=process.env.HOST || "0.0.0.0";
  const port=Number(process.env.PORT || 8080);
  const server=createBaseLabConsoleServer();
  server.listen(port,host,()=>console.log(JSON.stringify({status:"listening",host,port,runtime:process.env.BASE_LAB_RUNTIME_MODE||"local_preview"})));
}
