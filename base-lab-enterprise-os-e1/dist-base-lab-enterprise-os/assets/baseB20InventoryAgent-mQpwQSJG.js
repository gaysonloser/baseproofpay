import"./modulepreload-polyfill-Dezn_h7o.js";var e=await fetch(`/api/v1/b20-inventory-agent`,{headers:{accept:`application/json`}});if(!e.ok)throw Error(`B20 inventory candidate unavailable`);var t=await e.json(),n=(e,t=10,n=8)=>e&&e.length>t+n?`${e.slice(0,t)}...${e.slice(-n)}`:e,r=t.six_lanes,i=(e,t,n,r)=>`<div class="stage"><span>${String(e).padStart(2,`0`)}</span><div><strong>${t}</strong><small>${n}</small></div><em>${r}</em></div>`,a=e=>`<li><span class="${e.passed?`pass`:`fail`}"></span><strong>${e.id.replaceAll(`_`,` `)}</strong><code>${e.observed}</code></li>`;document.querySelector(`#app`).innerHTML=`
  <header class="topbar"><a href="/enterprise-os.html">CATVERSE Base Lab OS</a><span>Base Sepolia B20 verified · mainnet remains fail-closed</span></header>
  <main>
    <section class="hero"><div><p>BASE-NATIVE INVENTORY OPERATIONS</p><h1>B20 inventory entitlement with agent-paid evidence</h1><span>ERPNext owns physical quantity, cost and close. B20 carries a controlled operational entitlement. x402 sells the evidence report in USDC.</span></div>
      <aside><small>CANDIDATE TOKEN</small><strong>${t.token.symbol}</strong><span>${t.token.name}</span><em>${t.status.replaceAll(`_`,` `)}</em></aside>
    </section>
    <section class="activation strip"><div><span>B20 Asset</span><strong>${t.activation.asset_active?`Active`:`Inactive`}</strong></div><div><span>Production target</span><strong>${t.activation.target}</strong></div><div><span>Verified network</span><strong>${t.deployment_gate.current_testnet_rehearsal.network.name}</strong></div><div><span>Factory</span><code>${n(t.token.factory)}</code></div><div><span>Sepolia lifecycle</span><strong>${t.deployment_gate.verified_policy_gated_mint?.receipt_status===`0x1`?`Policy + 100 CATBOX mint verified`:`Create only`}</strong></div></section>
    <section class="band"><div class="heading"><div><p>CONTROLLED FLOW</p><h2>One batch, four authorities</h2></div><span>Human approval at every write</span></div>
      <div class="stages">
        ${i(1,`ERP receipt accepted`,`ERPNext · SLE`,`100 Box`)}
        ${i(2,`B20 mintWithMemo`,`Base B20 Asset`,`100 CATBOX`)}
        ${i(3,`Inspection report`,`x402 · USDC`,`$0.01 preview`)}
        ${i(4,`Agent policy review`,`Base MCP / Agentic`,`No auto-pay`)}
        ${i(5,`Transfer + ERP fulfilment`,`B20 + DN/SLE/GL`,`10 Box`)}
        ${i(6,`Burn + InventoryRoot`,`B20 + Registry`,`90 closing`)}
      </div>
    </section>
    <section class="band split"><div><div class="heading"><div><p>QUANTITY RECONCILIATION</p><h2>Token supply must follow ERP stock</h2></div></div>
      <div class="recon"><div><span>Opening stock</span><strong>${r.erp_reconciliation.opening_quantity}</strong><small>Box · ERP SLE</small></div><b>−</b><div><span>Issued</span><strong>${r.erp_reconciliation.issued_quantity}</strong><small>Box · Delivery Note</small></div><b>=</b><div><span>Closing stock</span><strong>${r.erp_reconciliation.closing_quantity}</strong><small>Box · $${r.erp_reconciliation.closing_value_usd.toLocaleString()}</small></div><b>↔</b><div class="accent"><span>B20 supply</span><strong>${r.erp_reconciliation.b20_closing_supply_units}</strong><small>CATBOX · lifecycle candidate</small></div></div>
      <p class="boundary">B20 does not calculate cost, COGS or legal title. ERPNext remains authoritative.</p></div>
      <aside class="x402"><span>X402 RESOURCE</span><h3>${r.agent_x402.resource}</h3><strong>${r.agent_x402.price_usdc} USDC</strong><dl><dt>Payment rail</dt><dd>Base USDC</dd><dt>B20 as payment</dt><dd>No</dd><dt>Agent approval</dt><dd>Required</dd><dt>Status</dt><dd>${r.agent_x402.status.replaceAll(`_`,` `)}</dd></dl></aside>
    </section>
    <section class="band"><div class="heading"><div><p>SMART CONTRACT SURFACE</p><h2>Use native B20 controls before adding contracts</h2></div></div>
      <div class="contract-grid"><article><span>Factory</span><strong>B20 Asset</strong><code>${t.token.factory}</code><small>createB20 · deterministic 0xB200… address</small></article><article><span>Lifecycle</span><strong>Memo-linked</strong><code>mintWithMemo → transferWithMemo → burnWithMemo</code><small>Business IDs join ERP and chain evidence</small></article><article><span>Evidence</span><strong>Registry</strong><code>${r.chain_control.evidence_registry}</code><small>Periodic InventoryRoot reconciliation</small></article></div>
    </section>
    <section class="band"><div class="heading"><div><p>FAIL-CLOSED TESTS</p><h2>What the agent is not allowed to do</h2></div><span>${r.negative_control.filter(e=>e.passed).length}/${r.negative_control.length} passed</span></div><ul class="controls">${r.negative_control.map(a).join(``)}</ul></section>
    <section class="next"><div><span>VERIFIED TESTNET RESULT</span><h2>CATBOX create + policy-gated mint completed</h2><p>${n(t.deployment_gate.current_testnet_rehearsal.deployer)} created ${n(t.deployment_gate.testnet_creation.token_address)} through the official B20 Factory, then applied the allowlist-only mint policy and minted exactly 100 CATBOX to that same Base Sepolia EOA. Transfer scopes remain ALWAYS_BLOCK. The lifecycle used zero ETH value, made no ERP write, and did not activate mainnet.</p></div><dl><dt>Create receipt</dt><dd>${t.deployment_gate.testnet_creation.receipt_status}</dd><dt>Mint receipt</dt><dd>${t.deployment_gate.verified_policy_gated_mint?.receipt_status||`Not run`}</dd><dt>Mint tx</dt><dd>${n(t.deployment_gate.verified_policy_gated_mint?.mint_tx_hash||``)}</dd><dt>ERP write</dt><dd>None</dd><dt>Mainnet</dt><dd>Fail-closed</dd></dl></section>
  </main>
  <footer><span>Candidate fingerprint</span><code>${t.result_fingerprint_sha256}</code></footer>`;
