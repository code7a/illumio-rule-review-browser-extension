(() => {
  'use strict';

  // Prevent duplicate initialization in the same document/frame
  if (window.__RR_CS_LOADED__) { /* return; */ }
  window.__RR_CS_LOADED__ = true;

  function markOnceBody(flag) {
    const key = `data-rr-${flag}`;
    if (document.body.hasAttribute(key)) return false;
    document.body.setAttribute(key, "1");
    return true;
  }

  // Defer first ensure pass so all const/let declarations are initialized (TDZ-safe).
  if (markOnceBody("toolbars-initialized")) {
    // scheduleEnsureAll is declared later; using a next-tick avoids TDZ on consts.
    setTimeout(() => scheduleEnsureAll(0), 0);
  }

  /******************************************************************
   * Runtime config
   ******************************************************************/
  const DEBUG_HEAVY = false;            // set true for deep logs
  const ACTORS_TOKEN = 'ams';           // All-Workloads actors token

  /******************************************************************
   * HUD (simple, clean)
   ******************************************************************/
  const HUD_ID = '__rr_hud__';
  function createHUD() {
    if (document.getElementById(HUD_ID)) return getHUD();

    const host = document.createElement('div');
    host.id = HUD_ID;
    host.style.position = 'fixed';
    host.style.right = '12px';
    host.style.bottom = '12px';
    host.style.zIndex = '2147483647';
    host.style.width = '360px';
    host.style.maxHeight = '70vh';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });

    const css = document.createElement('style');
    css.textContent = `
      * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
      .panel { pointer-events: auto; background:#fff; color:#111; border:1px solid #d1d5db; border-radius:8px;
               box-shadow:0 10px 28px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.12); font-size:12px; overflow:hidden; }
      .hdr   { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:#f5f5f5; border-bottom:1px solid #e5e7eb; }
      .title { font-weight:600; }
      .btn   { border:1px solid #d1d5db; background:#fff; color:#111; border-radius:6px; padding:3px 8px; cursor:pointer; font-size:12px; }
      .btn:hover{ background:#f9fafb; }
      .btn:disabled { opacity:.6; cursor:not-allowed; }
      .body  { display:grid; grid-template-rows:auto auto auto 1fr; gap:8px; padding:10px; }
      .steps { background:#fafafa; border:1px solid #ececec; border-radius:6px; padding:6px 8px; max-height:160px; overflow:auto; }
      .step  { display:flex; gap:6px; padding:2px 0; border-left:3px solid transparent; padding-left:6px; }
      .step.ok  { border-left-color:#10b981; }
      .step.err { border-left-color:#ef4444; }
      .ico   { width:16px; text-align:center; }
      .row   { display:flex; gap:12px; flex-wrap:wrap; }
      .kv    { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:#0f172a; }
    `;

    const root = document.createElement('div');
    root.className = 'panel';
    root.innerHTML = `
      <div class="hdr">
        <div class="title">Rule Review HUD</div>
        <button class="btn btn-close" title="Close">×</button>
      </div>
      <div class="body">
        <div class="status"><span class="kv">Status:</span> <span class="statusline">Idle</span></div>
        <div class="steps"></div>
        <div class="row">
          <div><span class="kv">Job:</span> <span class="jobid">—</span></div>
          <div><span class="kv">Flows:</span> <span class="flowcount">—</span></div>
          <div><span class="kv">Max:</span> <span class="maxresults">—</span></div>
        </div>
        <div class="row">
          <div><span class="kv">Reviewed:</span> <span class="cnt-reviewed">0</span></div>
          <div><span class="kv">Disabled:</span> <span class="cnt-disabled">0</span></div>
          <div><span class="kv">Skipped:</span> <span class="cnt-skipped">0</span></div>
          <div><span class="kv">Errors:</span> <span class="cnt-errors">0</span></div>
        </div>
      </div>
    `;

    shadow.appendChild(css);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    const api = {
      el: host, shadow, root,
      setJob(id)        { shadow.querySelector('.jobid').textContent       = id || '—'; },
      setStatus(txt)    { shadow.querySelector('.statusline').textContent  = txt || ''; },
      setFlowCount(v)   { shadow.querySelector('.flowcount').textContent   = (v == null ? '—' : String(v)); },
      setMaxResults(v)  { shadow.querySelector('.maxresults').textContent  = (v == null ? '—' : String(v)); },
      addStep(label) {
        const wrap = shadow.querySelector('.steps');
        const row  = document.createElement('div');
        row.className = 'step';
        row.innerHTML = `<div class="ico">⏳</div><div>${label}</div>`;
        wrap.appendChild(row);
        wrap.scrollTop = wrap.scrollHeight;
        return row;
      },
      markOK(step, msg)  { if (!step) return; step.classList.add('ok');  step.querySelector('.ico').textContent='✔'; if (msg) step.lastElementChild.textContent=msg; },
      markERR(step, msg) { if (!step) return; step.classList.add('err'); step.querySelector('.ico').textContent='⚠'; if (msg) step.lastElementChild.textContent=msg; },
      bumpMeter(which)   { const el = shadow.querySelector(`.cnt-${which}`); const n = parseInt(el.textContent||'0',10)||0; el.textContent = String(n+1); },
      setMeter(which,v)  { shadow.querySelector(`.cnt-${which}`).textContent = String(v); },
      close()            { host.remove(); },
    };

    shadow.querySelector('.btn.btn-close').addEventListener('click', () => api.close());
    host.__api = api;
    return api;
  }
  function getHUD() { const host = document.getElementById(HUD_ID); return (host && host.__api) ? host.__api : createHUD(); }

  /******************************************************************
   * Selectors, CSS, utils
   ******************************************************************/
  const GRID_SELECTOR            = 'div[data-tid~="comp-grid"][data-tid~="comp-grid-allow"]';
  const GRID_FALLBACK_SELECTOR   = 'div[data-tid="comp-grid"]';
  const ROW_SELECTOR             = 'div[data-tid="comp-grid-row"]';
  const BUTTONS_COL_SELECTOR     = 'div[data-tid="comp-grid-column-buttons"]';
  const EDIT_BUTTON_SELECTOR     = 'button[data-tid~="comp-button"][data-tid~="comp-button-edit"], button[aria-label="Edit"]';

  const COL_TID_CONSUMERS  = 'comp-grid-column-consumers';
  const COL_TID_PROVIDERS  = 'comp-grid-column-providers';
  const COL_TID_SERVICES   = 'comp-grid-column-providingservices';
  const COL_TID_RULENUMBER = 'comp-grid-column-rulenumber';
  const COL_TID_EXTRASCOPE = 'comp-grid-column-extrascope';
  const COL_TID_STATE      = 'comp-grid-column-state';
  const DIFF_SIDEBYSIDE_TID= 'comp-diff-sidebyside';
  const DIFF_ADDED_TID     = 'comp-diff-added';
  const DIFF_REMOVED_TID   = 'comp-diff-removed';
  const COL_TID_DIFFSTATUS = 'comp-grid-column-diffstatus';

  const TOOLBAR_SELECTOR        = 'div[data-tid="comp-toolbar"]';
  const TOOLGROUP_SELECTOR      = 'div[data-tid="comp-toolgroup"]';
  const TOOLGROUP_REFRESH_SEL   = 'button[data-tid~="comp-button"][data-tid~="comp-button-refresh"], button[aria-label="Refresh"]';
  const EXPORT_MENU_SEL         = 'nav[data-tid="comp-menu comp-menu-generate-report"]';
  const TOOLGROUP_MENU_SEL      = 'nav[data-tid="comp-menu comp-menu-ruleset-actions"]';

  // --- CSS shim for per-row button ---
  const CSS_BTN = `
    .rr-btn{display:inline-flex;align-items:center;justify-content:center;height:28px;width:28px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#111;cursor:pointer;margin-left:6px;padding:0;line-height:1}
    .rr-btn:hover{background:#f9fafb}
  `;
  function ensureCssOnce(){
    if (document.getElementById('__rr_min_css__')) return;
    const s = document.createElement('style'); s.id='__rr_min_css__'; s.textContent = CSS_BTN; document.head?.appendChild(s);
  }
  function hasRRButton(container){ return !!container.querySelector('button[data-rr="1"]'); }

  const toLower  = (s)=> (s||'').toString().trim().toLowerCase();
  const cleanTxt = (el)=> (el?.textContent||'').replace(/\u00A0/g,' ').trim();
  const sleep    = (ms)=> new Promise(r => setTimeout(r, ms));

  /******************************************************************
   * Debounced ensure passes (fast but reliable)
   ******************************************************************/
  let ensurePending = false;
  function scheduleEnsureAll(delay=200){
    if (ensurePending) return;
    ensurePending = true;
    setTimeout(() => {
      ensurePending = false;
      try{
        ensureAllowGrids();
        ensureRulesetToolReviewButton();
        ensurePolicyListReviewButton();
      }catch{}
    }, delay);
  }

  /******************************************************************
   * Logging
   ******************************************************************/
  function logHeavy(label,obj){ if (DEBUG_HEAVY){ try{ console.log(JSON.stringify({[label]:obj})); }catch{} } }
  function logInfo(label,obj){ try{ console.log(JSON.stringify({[label]:obj})); }catch{} }
  function pillListToLog(pills){ return (pills||[]).map(p=>({text:p.text||'', href:p.href||null})); }
  function includeToStrings(includeArr){
    const out=[]; try{
      if (!Array.isArray(includeArr) || !Array.isArray(includeArr[0])) return ['<invalid>'];
      const g = includeArr[0];
      if (g.length===0) return ['ANY'];
      for (const e of g){
        if (e?.label?.href) out.push(`label:${e.label.href}`);
        else if (e?.ip_list?.href) out.push(`ip_list:${e.ip_list.href}`);
        else if (e?.workload?.href) out.push(`workload:${e.workload.href}`);
        else if (e?.actors) out.push(`actors:${e.actors}`);
        else out.push(JSON.stringify(e));
      }
    }catch(e){ out.push(`<err:${String(e?.message||e)}>`); }
    return out;
  }
  function servicesToStrings(svc){
    const out=[]; try{
      const list = Array.isArray(svc)? svc : [];
      for (const s of list){
        const proto = Number.isFinite(s?.proto) ? s.proto :
                      (Number.isFinite(s?.service_ports?.[0]?.proto) ? s.service_ports[0].proto : '?');
        if (Array.isArray(s?.service_ports) && s.service_ports.length){
          for (const p of s.service_ports){
            const pr = Number.isFinite(p?.proto)? p.proto : proto;
            if (Number.isFinite(p?.port)) out.push(`${pr}:${p.port}${Number.isFinite(p.to_port)?'-'+p.to_port:''}`);
            else out.push(`${pr}:*`);
          }
        }else if (Number.isFinite(s?.port)){
          out.push(`${proto}:${s.port}${Number.isFinite(s.to_port)?'-'+s.to_port:''}`);
        }else{
          out.push(`${proto}:*`);
        }
      }
    }catch(e){ out.push(`<err:${String(e?.message||e)}>`); }
    return out;
  }

  /******************************************************************
   * Row state helpers
   ******************************************************************/
  function getRowStatus(row){
    const stateCol = row.querySelector(`[data-tid="${COL_TID_STATE}"]`);
    if (stateCol){
      const sbs = stateCol.querySelector(`[data-tid="${DIFF_SIDEBYSIDE_TID}"]`);
      if (sbs){
        const added   = toLower(sbs.querySelector(`[data-tid="${DIFF_ADDED_TID}"]`)?.textContent);
        const removed = toLower(sbs.querySelector(`[data-tid="${DIFF_REMOVED_TID}"]`)?.textContent);
        if (added==='enabled') return 'enabled';
        if (added==='disabled') return 'disabled';
        if (removed==='enabled') return 'disabled';
        if (removed==='disabled') return 'enabled';
      }
      const plain = toLower(stateCol.textContent);
      if (plain.includes('enabled') && !plain.includes('disabled')) return 'enabled';
      if (plain.includes('disabled') && !plain.includes('enabled')) return 'disabled';
    }
    const buttonsCell = row.querySelector(BUTTONS_COL_SELECTOR);
    if (buttonsCell){
      const hasDisable = buttonsCell.querySelector('button[title*="Disable" i], button[aria-label*="Disable" i]');
      const hasEnable  = buttonsCell.querySelector('button[title*="Enable"  i], button[aria-label*="Enable"  i]');
      if (hasDisable) return 'enabled';
      if (hasEnable)  return 'disabled';
    }
    return 'unknown';
  }
  function isPendingUpdate(row){
    const diffStatusCol = row.querySelector(`[data-tid="${COL_TID_DIFFSTATUS}"]`);
    const t = toLower(cleanTxt(diffStatusCol));
    return t.includes('pending');
  }
  function getScopeMode(row){
    const col = row.querySelector(`[data-tid="${COL_TID_EXTRASCOPE}"]`);
    const t = toLower(cleanTxt(col));
    if (t.includes('intra')) return 'intra';
    if (t.includes('extra')) return 'extra';
    return 'unknown';
  }

  /******************************************************************
   * Pill readers
   ******************************************************************/
  function readPillColumnStructured(row, columnTid){
    const col = row.querySelector(`[data-tid="${columnTid}"]`);
    if (!col) return [];
    const anchors = Array.from(col.querySelectorAll('a[data-tid^="comp-pill"]'));
    const spans   = Array.from(col.querySelectorAll('span[data-tid^="comp-pill"]'));

    const fromAnchors = anchors.map(a => ({
      text: ((a.querySelector('[data-tid="elem-text"]')?.textContent) || a.textContent || '').trim(),
      href: a.getAttribute('href') || a.href || null
    })).filter(x=>x.text);

    const fromSpans = spans.map(s => ({
      text: ((s.querySelector('[data-tid="elem-text"]')?.textContent) || s.textContent || '').trim()
    })).filter(x=>x.text);

    const pills = [...fromAnchors, ...fromSpans];
    if (pills.length) return pills;
    const txt = (col.textContent||'').trim();
    return txt ? [{ text: txt }] : [];
  }
  function getRowParts(row){
    const sources  = readPillColumnStructured(row, COL_TID_CONSUMERS);
    const dests    = readPillColumnStructured(row, COL_TID_PROVIDERS);
    const services = readPillColumnStructured(row, COL_TID_SERVICES);
    return { sources, destinations: dests, services };
  }
  function isAnyIpListPill(pill){
    const txt = (pill?.text||'').toLowerCase();
    return txt === 'any' || txt.startsWith('any ') || txt.includes('0.0.0.0/0') || txt.includes('::/0');
  }
  function getRuleNumber(row){
    const col = row.querySelector(`[data-tid="${COL_TID_RULENUMBER}"]`);
    const t = (col?.textContent||'').trim();
    return t || null;
  }

  /******************************************************************
   * Org + ruleset helpers
   ******************************************************************/
  function getRulesetIdFromHash(){
    const m = String(location.hash||'').match(/\/(?:rule|rules)sets\/(\d+)\b/i) || String(location.hash||'').match(/\/rulesets\/(\d+)\b/);
    return m ? m[1] : null;
  }
  async function getOrgIdFromBackground(retries=20, delayMs=250){
    for (let i=0;i<retries;i++){
      try{
        const resp = await chrome.runtime.sendMessage({ type:'GET_ORG_ID' });
        const id = resp?.orgId ? String(resp.orgId) : null;
        if (id) return id;
      }catch{}
      await new Promise(r=>setTimeout(r, delayMs));
    }
    return null;
  }

  /******************************************************************
   * Services helpers (ACTIVE) + cache
   ******************************************************************/
  const SERVICE_ID_RE = /\/services\/(\d+)\b/;
  const servicePortsCache = new Map(); // serviceId -> [{proto,port,to_port}...]

  function extractServiceIdFromHref(href){
    if (!href) return null;
    const m = String(href).match(SERVICE_ID_RE);
    return m ? m[1] : null;
  }
  function normalizePort(p){
    const pick=(...vals)=>{ for(const v of vals) if (Number.isFinite(v)) return v; return null; };
    const proto = pick(p?.proto, p?.protocol);
    const port  = pick(p?.port,  p?.from_port, p?.port_range_start);
    const to    = pick(p?.to_port, p?.port_range_end);
    if (!Number.isFinite(proto)) return null;
    if (!Number.isFinite(port))  return { proto };
    const out = { proto, port };
    if (Number.isFinite(to) && to>=port) out.to_port = to;
    return out;
  }
  async function fetchServicePortsActive(orgId, serviceId){
    if (servicePortsCache.has(serviceId)) return servicePortsCache.get(serviceId);
    const url = `${location.origin}/api/v2/orgs/${orgId}/sec_policy/active/services/${serviceId}`;
    const res = await fetch(url, { credentials:'include', headers:{Accept:'application/json'} });
    if (!res.ok) throw new Error(`GET ${url} HTTP ${res.status}`);
    const json = await res.json();
    const rawPorts = Array.isArray(json?.service_ports) ? json.service_ports : (Array.isArray(json?.ports) ? json.ports : []);
    const out = [];
    for (const p of rawPorts){
      const norm = normalizePort(p);
      if (norm) out.push(norm);
    }
    servicePortsCache.set(serviceId, out);
    return out;
  }
  function dedupKey(sp){
    const proto = Number.isFinite(sp?.proto)? sp.proto : '';
    const port  = Number.isFinite(sp?.port) ? sp.port  : '';
    const to    = Number.isFinite(sp?.to_port)? sp.to_port : '';
    return `${proto}|${port}|${to}`;
  }
  function parseServicePillText(text){
    if (!text) return [];
    const out = [];
    const tl = String(text).trim().toLowerCase();
    let m = tl.match(/^(\d+)\s*-\s*(\d+)\s*(tcp|udp)\b/);
    if (m){ const p1=+m[1], p2=+m[2], proto=(m[3]==='tcp'?6:17); if (!isNaN(p1)&&!isNaN(p2)&&p2>=p1) out.push({proto,port:p1,to_port:p2}); }
    m = tl.match(/^(\d+)\s*(tcp|udp)\b/);
    if (m){ const port=+m[1], proto=(m[2]==='tcp'?6:17); if (!isNaN(port)) out.push({proto,port}); }
    m = tl.match(/^(tcp|udp)\b/);
    if (m){ const proto=(m[1]==='tcp'?6:17); out.push({proto}); }
    const seen = new Set(), dedup=[];
    for (const it of out){
      const key = `${Number.isFinite(it.proto)?it.proto:''}|${Number.isFinite(it.port)?it.port:''}|${Number.isFinite(it.to_port)?it.to_port:''}`;
      if (!seen.has(key)){ seen.add(key); dedup.push(it); }
    }
    return dedup;
  }
  async function buildServicesInclude(servicesPills, orgId){
    const ids = [...new Set(servicesPills.map(s=>extractServiceIdFromHref(s.href)).filter(Boolean))];
    const include = [], seen = new Set();
    for (const sid of ids){
      try{
        const ports = await fetchServicePortsActive(orgId, sid);
        for (const it of ports){ const key = dedupKey(it); if (!seen.has(key)){ seen.add(key); include.push(it); } }
      }catch(e){ console.warn('[RR] Service fetch failed', sid, e); }
    }
    for (const pill of servicesPills){
      if (extractServiceIdFromHref(pill.href)) continue;
      const parsed = parseServicePillText(pill.text);
      for (const it of parsed){ const key = dedupKey(it); if (!seen.has(key)){ seen.add(key); include.push(it); } }
    }
    return include;
  }

  /******************************************************************
   * Ruleset draft fetchers
   ******************************************************************/
  async function fetchRulesetScopeDraft(orgId, rulesetId){
    const url = `${location.origin}/api/v2/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}`;
    try{
      const res = await fetch(url, { credentials:'include', headers:{Accept:'application/json'} });
      if (!res.ok) return null;
      const rs = await res.json();
      const rawScopes = Array.isArray(rs?.scopes)? rs.scopes : [];
      const clauses = rawScopes.map(cl => Array.isArray(cl) ? cl.map(s=>s?.label?.href).filter(Boolean) : [])
                               .filter(arr=>arr.length>0);
      return { rulesetId, clauses };
    }catch{ return null; }
  }
  async function fetchRulesetDraftFull(orgId, rulesetId){
    const url = `${location.origin}/api/v2/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}`;
    try{ const res=await fetch(url,{credentials:'include',headers:{Accept:'application/json'}}); if(!res.ok) return null; return await res.json(); }catch{ return null; }
  }
  async function fetchDraftRules(orgId, rulesetId){
    const url = `${location.origin}/api/v2/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}/sec_rules`;
    const res = await fetch(url, { credentials:'include', headers:{Accept:'application/json'} });
    if (!res.ok){ logInfo('match_rule_lookup',{ok:false,status:res.status}); return []; }
    const list = await res.json().catch(()=>[]);
    logInfo('match_rule_lookup',{ok:true,count:Array.isArray(list)?list.length:0});
    return Array.isArray(list)? list : [];
  }

  /******************************************************************
   * Map UI pills → Explorer entities
   ******************************************************************/
  const UI_RE_LABEL       = /#\/labels\/(\d+)/i;
  const UI_RE_IPLIST      = /#\/iplists\/(\d+)/i;
  const UI_RE_ALLWL       = /#\/workloads(?:$|\/?#)/i;
  const UI_RE_WORKLOAD_ID = /#\/workloads\/([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})/i;

  function pillToEntity(pill, orgId){
    const href = pill.href || '';
    if (UI_RE_WORKLOAD_ID.test(href)){ const id = UI_RE_WORKLOAD_ID.exec(href)[1]; return { workload:{ href:`/orgs/${orgId}/workloads/${id}` } }; }
    if (UI_RE_LABEL.test(href))     { const id = UI_RE_LABEL.exec(href)[1];       return { label:{ href:`/orgs/${orgId}/labels/${id}` } }; }
    if (UI_RE_IPLIST.test(href))    { const id = UI_RE_IPLIST.exec(href)[1];      return { ip_list:{ href:`/orgs/${orgId}/sec_policy/draft/ip_lists/${id}` } }; }
    if (UI_RE_ALLWL.test(href) || toLower(pill.text)==='all workloads') return 'ALL';
    return null;
  }
  function hasIpListPills(pills=[]){ return (pills||[]).some(p=>UI_RE_IPLIST.test(p?.href||'')); }
  function scopeLabelsToEntities(hrefs){ return (hrefs||[]).map(h => ({ label:{ href:h } })); }
  function applyScopeToSide(base, scopeLabelEntities, applyScope){
    if (!applyScope || !scopeLabelEntities.length) return base;
    const hasALL = base.includes('ALL');
    let out = base.filter(e=>e!=='ALL');
    const alreadyHasLabel = out.some(e=>e && e.label && e.label.href);
    if (hasALL){
      out = [...scopeLabelEntities];
    }else if (alreadyHasLabel){
      const dedupe = new Set(out.map(e=>JSON.stringify(e)));
      for (const se of scopeLabelEntities){ const key=JSON.stringify(se); if(!dedupe.has(key)){ dedupe.add(key); out.push(se); } }
    }
    return out;
  }
  function toExplorerIncludeArray(entities){
    const filtered = (entities||[]).filter(e=>e!=='ALL');
    if (filtered.length===0) return [[]];     // ANY
    return [filtered];
  }
  function entitiesToIncludeWithActors(entities, useActorsForALL){
    if (useActorsForALL && Array.isArray(entities) && entities.includes('ALL')){
      return [[ { actors: ACTORS_TOKEN } ]];  // AMS-only (no mixing)
    }
    return toExplorerIncludeArray(entities || []);
  }

  /******************************************************************
   * Effective & services signature (matching)
   ******************************************************************/
  const RE_LABEL_ID = /\/labels\/(\d+)\b/;
  const RE_IPLIST_ID = /\/ip_lists\/(\d+)\b/;
  const RE_WL_UUID  = /\/workloads\/([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})\b/;
  const RE_SVC_ID   = /\/services\/(\d+)\b/;

  function isEffectiveAll(eff){ return Array.isArray(eff) && eff.length>0 && Array.isArray(eff[0]) && eff[0].length===0; }
  function keysFromEffectiveEntities(eff){
    if (!Array.isArray(eff) || !Array.isArray(eff[0])) return [];
    const first = eff[0], keys=[];
    for (const e of first){
      if (e?.label?.href){ const m=/\/labels\/(\d+)\b/.exec(e.label.href); if (m) keys.push(`label:${m[1]}`); }
      else if (e?.ip_list?.href){ const m=/\/ip_lists\/(\d+)\b/.exec(e.ip_list.href); if (m) keys.push(`ip_list:${m[1]}`); }
      else if (e?.workload?.href){ const m=/\/workloads\/([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})\b/.exec(e.workload.href); if (m) keys.push(`workload:${m[1]}`); }
    }
    return keys;
  }
  function servicePortsToKey(p){
    const proto = Number.isFinite(p?.proto)? p.proto : '';
    const from  = Number.isFinite(p?.port)?  p.port  : '';
    const to    = Number.isFinite(p?.to_port)? p.to_port : from;
    return `${proto}:${from}-${to}`;
  }
  function buildRowServiceSignature(servicePills){
    const ports=[], ids = idsFromServicePills(servicePills);
    for (const pill of servicePills) parseServicePillText(pill.text).forEach(pp=>ports.push(servicePortsToKey(pp)));
    return { ports:new Set(ports), ids:new Set(ids) };
  }
  function idsFromServicePills(pills=[]){ return (pills||[]).map(p=>extractServiceIdFromHref(p.href)).filter(Boolean); }
  function parsePortKey(key){
    const [protoStr,range=''] = String(key).split(':');
    const proto = protoStr!=='' ? Number(protoStr) : null;
    let from=null,to=null;
    if (range.length){ const [a='',b=''] = range.split('-'); from = a!==''?Number(a):null; to = b!==''?Number(b):(from!==null?from:null); }
    return { proto, from, to };
  }
  function ruleCoversWant(ruleKey,wantKey){
    const r=parsePortKey(ruleKey), w=parsePortKey(wantKey);
    if (r.proto!==w.proto) return false;
    if (r.from===null && r.to===null) return true;
    if (w.from===null && w.to===null) return true;
    const wf = w.from ?? 0, wt = w.to ?? w.from ?? 65535;
    const rf = r.from ?? 0, rt = r.to ?? r.from ?? 65535;
    return wf>=rf && wt<=rt;
  }
  function portsSubsetCovered(rulePortsSet, wantPortsSet){
    if (!wantPortsSet || wantPortsSet.size===0) return true;
    if (!rulePortsSet || rulePortsSet.size===0) return false;
    for (const wantKey of wantPortsSet){
      let covered=false;
      for (const rk of rulePortsSet){ if (ruleCoversWant(rk,wantKey)){ covered=true; break; } }
      if (!covered) return false;
    }
    return true;
  }
  function buildApiRuleServiceSignature(rule){
    const ports=new Set(), ids=new Set();
    const list = Array.isArray(rule.ingress_services)? rule.ingress_services : [];
    for (const s of list){
      const raw = Array.isArray(s.service_ports)? s.service_ports : (Array.isArray(s.ports)? s.ports : null);
      if (raw) raw.map(normalizePort).filter(Boolean).forEach(p=>ports.add(servicePortsToKey(p)));
      if (!raw && (Number.isFinite(s.port) || Number.isFinite(s.proto))){ const norm=normalizePort(s); if (norm) ports.add(servicePortsToKey(norm)); }
      const m = /\/services\/(\d+)\b/.exec(s?.href||''); if (m) ids.add(m[1]);
    }
    return { ports, ids };
  }

  /******************************************************************
   * Time window & payload (90 days)
   ******************************************************************/
  function nowIso(){ return new Date().toISOString(); }
  function ninetyDaysAgoIso(){ return new Date(Date.now() - 90*24*60*60*1000).toISOString(); }
  function buildPayloadSkeleton(){
    return {
      sources:      { include:[[]], exclude:[] },
      destinations: { include:[[]], exclude:[] },
      services:     { include:[],  exclude:[] },
      sources_destinations_query_op: 'and',
      start_date: ninetyDaysAgoIso(),
      end_date:   nowIso(),
      policy_decisions: [],
      boundary_decisions: [],
      query_name: 'MAP_QUERY',
      exclude_workloads_from_ip_list_query: true,
      max_results: 100000
    };
  }

  /******************************************************************
   * CSRF
   ******************************************************************/
  function getCsrfToken(){
    try{
      const meta = document.querySelector('meta[name="csrf-token"]')?.content; if (meta) return meta;
      const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/); if (m) return decodeURIComponent(m[1]);
      const a = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]+)/); if (a) return decodeURIComponent(a[1]);
    }catch{}
    return null;
  }

  /******************************************************************
   * Async query: submit + poll + (optional) download
   ******************************************************************/
  async function submitAsyncTrafficQuery(orgId, payload){
    const url = `${location.origin}/api/v2/orgs/${orgId}/traffic_flows/async_queries`;
    const csrf = getCsrfToken(); const headers = { Accept:'application/json','Content-Type':'application/json' }; if (csrf) headers['x-csrf-token']=csrf;
    const res = await fetch(url, { method:'POST', credentials:'include', headers, body: JSON.stringify(payload) });
    if (res.status===406) logInfo('async_query_406_payload_preview', payload);
    const text = await res.text().catch(()=>''), data = text? ( ()=>{ try{return JSON.parse(text);}catch{return text;} })() : null;
    return { ok: res.ok, status: res.status, data };
  }
  function normalizeApiHref(href){
    if (!href) return null;
    if (href.startsWith('http')) return href;
    const path = href.startsWith('/api/')? href : `/api/v2${href}`;
    return `${location.origin}${path}`;
  }
  function isTerminalStatus(s){ const t=String(s||'').toLowerCase(); return (t==='completed'||t==='failed'||t==='canceled'||t==='timeout'); }
  async function pollAsyncQuery(orgId, href, opts={}, hud){
    const url = normalizeApiHref(href); if (!url){ logInfo('async_query_poll_error',{error:'invalid_href',href}); return null; }
    const maxWaitMs = opts.maxWaitMs ?? 15*60*1000, minDelayMs=opts.minDelayMs ?? 750, maxDelayMs=opts.maxDelayMs ?? 5000;
    let delay=minDelayMs, lastStatus=null; const start=Date.now();
    while (Date.now()-start < maxWaitMs){
      try{
        const res = await fetch(url, { credentials:'include', headers:{Accept:'application/json'} });
        const text = await res.text().catch(()=>''), data = text? ( ()=>{ try{return JSON.parse(text);}catch{return text;} })() : null;
        const status = data?.status ?? data?.state ?? null;
        if (status!==lastStatus){ lastStatus=status; logInfo('async_query_poll',{status,href}); hud?.setStatus?.(`Polling: ${status||'unknown'}`); }
        if (!res.ok){ logInfo('async_query_poll_error',{statusCode:res.status,href,data}); return data; }
        if (isTerminalStatus(status)){ logInfo('async_query_final',data); hud?.setStatus?.(`Polling: ${status} (done)`); hud?.setFlowCount?.((data && (data.flows_count ?? data.matches_count ?? '—'))); return data; }
      }catch(e){ logInfo('async_query_poll_exception',{error:String(e?.message||e),href}); }
      await new Promise(r=>setTimeout(r,delay)); delay = Math.min(Math.floor(delay*1.5), maxDelayMs);
    }
    logInfo('async_query_timeout',{href, waited_ms: Date.now()-start}); return null;
  }
  async function downloadAsyncQuery(resultHref){
    try{
      const url = normalizeApiHref(resultHref);
      const res = await fetch(url,{credentials:'include',headers:{Accept:'application/json, text/csv, text/plain; q=0.8'}});
      if (!res.ok){ logInfo('async_query_download_error',{status:res.status, href:resultHref}); return null; }
      const ct = (res.headers.get('content-type')||'').toLowerCase();
      if (ct.includes('application/json') || ct.endsWith('+json') || ct.includes('text/json')){
        const json = await res.json().catch(()=>null); if (json!=null) return { json, text:null, contentType: ct };
        const text = await res.text(); return { json:null, text, contentType: ct };
      }
      const text = await res.text(); return { json:null, text, contentType: ct };
    }catch(e){ logInfo('async_query_download_exception',{error:String(e?.message||e), href:resultHref}); return null; }
  }

  /******************************************************************
   * Disable / Tighten helpers
   ******************************************************************/
  function setEq(a,b){ if (a.size!==b.size) return false; for (const v of a) if (!b.has(v)) return false; return true; }

  function buildTightenBody(side, ipHref){
    if (side==='src') return { unscoped_consumers:false, consumers:[{ ip_list:{ href: ipHref } }] };
    if (side==='dst') return { providers:[{ ip_list:{ href: ipHref } }] };
    return null;
  }
  async function putDraftRuleTightenIpList(ruleUrl, side, ipHref){
    const csrf=getCsrfToken(); const headers={Accept:'application/json','Content-Type':'application/json'}; if (csrf) headers['x-csrf-token']=csrf;
    const body = buildTightenBody(side,ipHref); if (!body) return { ok:false, status:0, data:'invalid_side' };
    try{
      logHeavy('tighten_put_body_preview',{side,ip_href:ipHref, body});
      const res = await fetch(ruleUrl,{method:'PUT',credentials:'include',headers,body:JSON.stringify(body)});
      const text=await res.text().catch(()=>''), data=text?( ()=>{ try{return JSON.parse(text);}catch{return text;} })():null;
      logInfo('tighten_put',{ok:res.ok,status:res.status,side});
      return { ok:res.ok, status:res.status, data, bodyPreview:body };
    }catch(e){ logInfo('tighten_put_exception', String(e?.message||e)); return { ok:false, status:0, data:String(e?.message||e) }; }
  }
  function toDraftServiceHref(href,orgId){ const m=RE_SVC_ID.exec(href||''); return m? `/orgs/${orgId}/sec_policy/draft/services/${m[1]}` : null; }
  function stripProviderForPut(p){
    if (!p || typeof p!=='object') return null;
    if (p.actors) return { actors:p.actors };
    if (p.label?.href)   return { ...(p.exclusion!=null?{exclusion:!!p.exclusion}:{}) , label:{ href:p.label.href } };
    if (p.ip_list?.href) return { ...(p.exclusion!=null?{exclusion:!!p.exclusion}:{}) , ip_list:{ href:p.ip_list.href } };
    return null;
  }
  function stripConsumerForPut(c){
    if (!c || typeof c!=='object') return null;
    const out={}; if (c.exclusion!=null) out.exclusion=!!c.exclusion;
    if (c.workload?.href) return { ...out, workload:{ href:c.workload.href } };
    if (c.label?.href)    return { ...out, label:{ href:c.label.href } };
    if (c.ip_list?.href)  return { ...out, ip_list:{ href:c.ip_list.href } };
    return null;
  }
  function stripServiceForPutItem(s,orgId){
    if (!s || typeof s!=='object') return null;
    if (s.href){ const href=toDraftServiceHref(s.href,orgId)||s.href; return { href }; }
    const raw=Array.isArray(s.service_ports)?s.service_ports:(Array.isArray(s.ports)?s.ports:null);
    if (raw){ const service_ports = raw.map(normalizePort).filter(Boolean); if (service_ports.length) return { service_ports }; }
    if (Number.isFinite(s.port)||Number.isFinite(s.proto)){ const sp=normalizePort(s); if (sp) return { service_ports:[sp] }; }
    return null;
  }
  function buildMinimalDisableBody(){ return { enabled:false }; }
  function buildProvidersConsumersOnlyBody(rule){
    const providers=(rule.providers??[]).map(stripProviderForPut).filter(Boolean);
    const consumers=(rule.consumers??[]).map(stripConsumerForPut).filter(Boolean);
    const body={ enabled:false };
    if (providers.length) body.providers=providers;
    if (consumers.length) body.consumers=consumers;
    if (rule.unscoped_consumers!=null) body.unscoped_consumers=!!rule.unscoped_consumers;
    return body;
  }
  function sanitizeRuleForPut(rule,orgId){
    const providers=(rule.providers??[]).map(stripProviderForPut).filter(Boolean);
    const consumers=(rule.consumers??[]).map(stripConsumerForPut).filter(Boolean);
    const ingress_services=(rule.ingress_services??[]).map(s=>stripServiceForPutItem(s,orgId)).filter(Boolean);
    const egress_services=(rule.egress_services??[]).map(s=>stripServiceForPutItem(s,orgId)).filter(Boolean);
    const body={ enabled:false };
    if (providers.length) body.providers=providers;
    if (consumers.length) body.consumers=consumers;
    if (ingress_services.length) body.ingress_services=ingress_services;
    if (egress_services.length)  body.egress_services=egress_services;
    if (rule.unscoped_consumers!=null) body.unscoped_consumers=!!rule.unscoped_consumers;
    return body;
  }
  async function putDraftRuleEnabledFalse(ruleUrl, ruleObj, orgId){
    const csrf=getCsrfToken(); const headers={Accept:'application/json','Content-Type':'application/json'}; if (csrf) headers['x-csrf-token']=csrf;
    const attempts = [
      { name:'minimal',                    body:buildMinimalDisableBody() },
      { name:'providers_consumers_only',   body:buildProvidersConsumersOnlyBody(ruleObj) },
      { name:'with_services_last_resort',  body:sanitizeRuleForPut(ruleObj,orgId) }
    ];
    let last=null;
    for (const a of attempts){
      try{
        logHeavy('disable_rule_put_body_preview',{attempt:a.name, body:a.body});
        const res  = await fetch(ruleUrl,{method:'PUT',credentials:'include',headers,body:JSON.stringify(a.body)});
        const text = await res.text().catch(()=>''), data = text? ( ()=>{ try{return JSON.parse(text);}catch{return text;} })() : null;
        logInfo('disable_rule_put',{attempt:a.name, ok:res.ok, status:res.status, href:ruleUrl});
        if (res.ok) return { ok:true, status:res.status, data, bodyPreview:a.body, attempt:a.name };
        if (res.status===406) logInfo('disable_rule_put_406_hint','Send only writable fields; if services are sent use DRAFT hrefs or inline service_ports.');
        last = { ok:false, status:res.status, data, bodyPreview:a.body, attempt:a.name };
      }catch(e){ last = { ok:false, status:0, data:String(e?.message||e), bodyPreview:a.body, attempt:a.name }; }
    }
    return last ?? { ok:false, status:0, data:null, attempt:'unknown' };
  }
  async function confirmDisabled(ruleUrl){
    try{ const res=await fetch(ruleUrl,{credentials:'include',headers:{Accept:'application/json'}}); const json=await res.json().catch(()=>null);
         const enabled=!!json?.enabled; logInfo('disable_rule_confirm',{ok:res.ok, enabled}); return { ok:res.ok, enabled }; }
    catch(e){ logInfo('disable_rule_confirm_error', String(e?.message||e)); return { ok:false, enabled:undefined }; }
  }

  /******************************************************************
   * IP‑List tightening analysis
   ******************************************************************/
  function analyzeCommonIpList(flows, side = 'src') {
    if (!Array.isArray(flows) || flows.length === 0) return null;

    const getLists = (f) => Array.isArray(f?.[side]?.ip_lists) ? f[side].ip_lists : [];
    const total = flows.length;

    const counts  = new Map(); // href -> count across flows
    const meta    = new Map(); // href -> { name, size }
    const indices = new Map(); // href -> [index-of-appearance per flow]

    for (let i = 0; i < total; i++) {
      const lists = getLists(flows[i]);
      const seenThisFlow = new Set();
      for (let idx = 0; idx < lists.length; idx++) {
        const it = lists[idx];
        const href = it?.href;
        if (!href || seenThisFlow.has(href)) continue;
        seenThisFlow.add(href);
        counts.set(href, (counts.get(href) || 0) + 1);
        if (!meta.has(href)) meta.set(href, { name: it?.name || null, size: it?.size ?? null });
        if (!indices.has(href)) indices.set(href, []);
        indices.get(href).push(idx);
      }
    }

    const commons = [];
    counts.forEach((c, href) => {
      if (c === total) {
        const idxArr = indices.get(href) || [];
        if (idxArr.length !== total) return;
        const maxIndex = Math.max(...idxArr);
        const avgIndex = idxArr.reduce((a, b) => a + b, 0) / total;
        const { name, size } = meta.get(href) || {};
        commons.push({ href, name, size, indices: idxArr, maxIndex, avgIndex });
      }
    });

    if (commons.length === 0) return null;

    commons.sort((a, b) =>
      a.maxIndex - b.maxIndex ||
      a.avgIndex - b.avgIndex ||
      String(a.name || a.href).localeCompare(String(b.name || b.href))
    );

    return { best: commons[0], candidates: commons };
  }

  /******************************************************************
   * UI Refresh helper
   ******************************************************************/
  function tryRefreshUI() {
    try {
      // Prefer a visible Refresh button if present
      const btn = document.querySelector(
        'button[aria-label*="Refresh" i], [data-tid*="refresh" i], button[title*="Refresh" i]'
      );
      if (btn) { btn.click(); return; }

      // Fallback: hash jiggle to trigger SPA refresh without navigation
      const h = location.hash || '';
      const sep = h.includes('?') ? '&' : '?';
      const temp = `${h}${sep}_rr_refresh=${Date.now()}`;
      location.hash = temp;
      setTimeout(() => { location.hash = h; }, 80);
    } catch {
      // Last resort: reload
      setTimeout(() => location.reload(), 250);
    }
  }

  /******************************************************************
   * Match + disable using row context
   ******************************************************************/
  function scoreRuleMatch(rowConsKeys,rowConsAll,rowProvKeys,rowProvAll,rowSvcSig,apiRule){
    const apiSig = buildApiRuleServiceSignature(apiRule);
    if (rowSvcSig?.ports?.size>0){ const ok=portsSubsetCovered(apiSig.ports,rowSvcSig.ports); if (!ok) return {score:-1}; }
    else if (rowSvcSig?.ids?.size>0){ for (const k of rowSvcSig.ids) if (!apiSig.ids.has(k)) return {score:-1}; }
    let score=5;
    const apiConsKeys = new Set((apiRule.consumers||[]).map(c=>keyFromApiConsumer(c)).filter(Boolean));
    const apiHasAllConsumers = !!apiRule.unscoped_consumers;
    if (rowConsAll && apiHasAllConsumers) score+=2;
    else if (!rowConsAll && !apiHasAllConsumers && setEq(new Set(rowConsKeys), apiConsKeys)) score+=2;
    else if (!rowConsAll && !apiHasAllConsumers){ let overlap=0; for (const k of rowConsKeys) if (apiConsKeys.has(k)) overlap++; if (overlap>0) score+=1; }

    const apiProvKeys = new Set((apiRule.providers||[]).map(p=>keyFromApiProvider(p)).filter(Boolean));
    const apiHasAllProviders = (apiRule.providers||[]).some(p=>!!p.actors);
    if (rowProvAll && apiHasAllProviders) score+=2;
    else if (!rowProvAll && !apiHasAllProviders && setEq(new Set(rowProvKeys), apiProvKeys)) score+=2;
    else if (!rowProvAll && !apiHasAllProviders){ let overlap=0; for (const k of rowProvKeys) if (apiProvKeys.has(k)) overlap++; if (overlap>0) score+=1; }

    if (apiRule.enabled===true) score+=0.1;
    return { score };
  }
  function keyFromApiConsumer(c){
    if (c?.label?.href){ const m=RE_LABEL_ID.exec(c.label.href); if (m) return `label:${m[1]}`; }
    if (c?.ip_list?.href){ const m=RE_IPLIST_ID.exec(c.ip_list.href); if (m) return `ip_list:${m[1]}`; }
    if (c?.workload?.href){ const m=RE_WL_UUID.exec(c.workload.href); if (m) return `workload:${m[1]}`; }
    return null;
  }
  function keyFromApiProvider(p){
    if (p?.label?.href){ const m=RE_LABEL_ID.exec(p.label.href); if (m) return `label:${m[1]}`; }
    if (p?.ip_list?.href){ const m=RE_IPLIST_ID.exec(p.ip_list.href); if (m) return `ip_list:${m[1]}`; }
    if (p?.actors) return 'ALL';
    if (p?.workload?.href){ const m=RE_WL_UUID.exec(p.workload.href); if (m) return `workload:${m[1]}`; }
    return null;
  }
  async function matchRuleByRow(orgId, rulesetId, consumersArg, providersArg, servicePills){
    const rules = await fetchDraftRules(orgId, rulesetId); if (!rules.length) return null;
    const rowConsKeys = keysFromEffectiveEntities(consumersArg.effective);
    const rowProvKeys = keysFromEffectiveEntities(providersArg.effective);
    const rowConsAll  = isEffectiveAll(consumersArg.effective);
    const rowProvAll  = isEffectiveAll(providersArg.effective);
    const rowSvcSig   = buildRowServiceSignature(servicePills);
    let best=null;
    for (const r of rules){
      const { score } = scoreRuleMatch(rowConsKeys,rowConsAll,rowProvKeys,rowProvAll,rowSvcSig,r);
      if (score>=5){ if (!best || score>best.score) best={ rule:r, score }; }
    }
    if (best){ const href = best.rule?.href || `/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}/sec_rules/${best.rule.id}`;
               logInfo('match_rule_pick',{rule_id:best.rule?.id, rule_number:best.rule?.rule_number, score:best.score}); return href; }
    logInfo('match_rule_pick',{reason:'no_good_match', candidates:rules.length}); return null;
  }
  function withTimeout(promise,ms){ let t; const to=new Promise(res=>{ t=setTimeout(()=>res('__TIMEOUT__'),ms); }); return Promise.race([promise,to]).then(r=>{ clearTimeout(t); return r;}); }
  async function disableRuleByMatchingRow(orgId, rulesetId, consumersArg, providersArg, servicePills, hud){
    try{
      const stepFind = hud?.addStep('Finding API rule to disable…');
      const ruleHref = await withTimeout(matchRuleByRow(orgId,rulesetId,consumersArg,providersArg,servicePills), 20000);
      if (!ruleHref || ruleHref==='__TIMEOUT__'){ hud?.markERR(stepFind,'No API rule match (timeout)'); logInfo('disable_rule_lookup',{ok:false,reason:'no_match_or_timeout'}); return { success:false }; }
      hud?.markOK(stepFind,'Matched rule');

      const stepGet = hud?.addStep('Loading rule (draft)…');
      const got = await getDraftRule(orgId, ruleHref);
      if (!got.ok || !got.data){ hud?.markERR(stepGet,`GET failed (${got.status})`); return { success:false }; }
      hud?.markOK(stepGet,'Rule loaded');

      const stepPut = hud?.addStep('Disabling rule…');
      const putRes = await putDraftRuleEnabledFalse(got.url, got.data, orgId);
      if (!putRes.ok){ hud?.markERR(stepPut,`PUT failed (${got.status})`); return { success:false }; }
      hud?.markOK(stepPut,'Disabled (server accepted)');

      const stepConf = hud?.addStep('Confirming disabled state…');
      const conf = await confirmDisabled(got.url);
      if (conf.ok && conf.enabled===false){ hud?.markOK(stepConf,'Confirmed disabled'); return { success:true }; }
      else { hud?.markERR(stepConf,'Confirm failed or still enabled'); return { success:false }; }
    }catch(e){ logInfo('disable_rule_exception', String(e?.message||e)); return { success:false }; }
  }
  async function getDraftRule(orgId, ruleHref){
    const url=normalizeApiHref(ruleHref); const res=await fetch(url,{credentials:'include',headers:{Accept:'application/json'}});
    const data=await res.json().catch(()=>null); logInfo('disable_rule_get',{ok:res.ok,status:res.status,href:ruleHref}); return { ok:res.ok, status:res.status, data, url };
  }

  /******************************************************************
   * Review one rule (DOM)
   ******************************************************************/
  async function reviewOneRow(row, orgId, rulesetId, scopeInfoCache, hud, options={refreshUI:true}){
    try{
      const rn = getRuleNumber(row);
      if (isPendingUpdate(row)){ hud?.bumpMeter('skipped'); const s=hud?.addStep(`Rule ${rn||''} skipped: Pending changes`); hud?.markOK(s,'Skip (pending)'); return; }
      const status=getRowStatus(row);
      if (status!=='enabled'){ hud?.bumpMeter('skipped'); const s=hud?.addStep(`Rule ${rn||''} skipped: Not enabled`); hud?.markOK(s,'Skip (disabled)'); return; }

      let scopeInfo = scopeInfoCache; if (!scopeInfo && rulesetId) scopeInfo = await fetchRulesetScopeDraft(orgId, rulesetId);
      const { sources, destinations, services } = getRowParts(row);
      const scopeMode = getScopeMode(row);

      logHeavy('dom_rule_snapshot',{ruleset_id:rulesetId, rule_number:rn, scope_mode:scopeMode,
        ui_sources:pillListToLog(sources), ui_destinations:pillListToLog(destinations), ui_services:pillListToLog(services)});

      const rowSourcePills  = sources.slice();
      const rowDestPills    = destinations.slice();
      const rowServicePills = services.slice();

      const srcHadIpListPill = hasIpListPills(rowSourcePills);
      const dstHadIpListPill = hasIpListPills(rowDestPills);
      const wantsDownload = srcHadIpListPill || dstHadIpListPill;

      const sourceBase = rowSourcePills.map(p=>pillToEntity(p,orgId)).filter(Boolean);
      const destBase   = rowDestPills.map(p=>pillToEntity(p,orgId)).filter(Boolean);

      const scopeLabelHrefs = (scopeInfo?.clauses||[]).reduce((acc,cl)=>{ for (const h of cl) acc.add(h); return acc; }, new Set());
      const scopeLabelEntities = scopeLabelsToEntities([...scopeLabelHrefs]);

      const applyScopeToSrc = (scopeMode==='intra');
      const applyScopeToDst = (scopeMode==='intra' || scopeMode==='extra');

      const hasAnySrcPill = rowSourcePills.some(isAnyIpListPill);
      const hasAnyDstPill = rowDestPills.some(isAnyIpListPill);

      let sourceFinal = sourceBase;
      let destFinal   = destBase;

      if (!hasAnySrcPill) sourceFinal = applyScopeToSide(sourceBase, scopeLabelEntities, applyScopeToSrc);
      else sourceFinal = [];  // ANY

      if (!hasAnyDstPill) destFinal = applyScopeToSide(destBase,  scopeLabelEntities, applyScopeToDst);
      else destFinal = [];    // ANY

      // Extra-source: if 'ALL' present on source → AMS only (no mixing); otherwise concrete list only.
      const useActorsForSrcALL = (scopeMode==='extra');
      const sourcesInclude      = hasAnySrcPill ? [[]] : entitiesToIncludeWithActors(sourceFinal, useActorsForSrcALL);
      const destinationsInclude = hasAnyDstPill ? [[]] : toExplorerIncludeArray(destFinal);

      const servicesInclude = await buildServicesInclude(rowServicePills, orgId);

      logHeavy('dom_rule_includes',{
        ruleset_id:rulesetId, rule_number:rn, scope_mode:scopeMode,
        sources_effective:includeToStrings(sourcesInclude),
        destinations_effective:includeToStrings(destinationsInclude),
        services_effective:servicesToStrings(servicesInclude)
      });

      const payload = buildPayloadSkeleton();
      payload.sources.include      = sourcesInclude;
      payload.destinations.include = destinationsInclude;
      payload.services.include     = servicesInclude;

      const createResp = await submitAsyncTrafficQuery(orgId, payload);
      if (!createResp.ok || !createResp?.data?.href){ hud?.bumpMeter('errors'); return; }

      const final = await pollAsyncQuery(orgId, createResp.data.href, {maxWaitMs:15*60*1000, minDelayMs:750, maxDelayMs:5000}, hud);
      if (!final){ hud?.bumpMeter('errors'); return; }

      const flowCount = Number(final?.flows_count ?? final?.matches_count ?? 0);
      let tightenedAny = false;

      if (wantsDownload && final?.result && flowCount>0){
        const got = await downloadAsyncQuery(final.result);
        let flowsJson = got?.json || null;
        if (!flowsJson && got?.text){ try{ const parsed=JSON.parse(got.text); if (Array.isArray(parsed)) flowsJson=parsed; }catch{} }

        if (Array.isArray(flowsJson) && flowsJson.length>0){
          const sidesToAnalyze=[]; if (srcHadIpListPill) sidesToAnalyze.push('src'); if (dstHadIpListPill) sidesToAnalyze.push('dst');
          for (const side of sidesToAnalyze){
            const analysis = analyzeCommonIpList(flowsJson, side);
            const stepFind = hud.addStep('Finding rule to tighten…');
            const ruleHref = await withTimeout(
              matchRuleByRow(orgId, rulesetId, {effective:sourcesInclude}, {effective:destinationsInclude}, rowServicePills),
              20000
            );
            if (!analysis?.best){ hud.markERR(stepFind,'No common IP list'); continue; }
            if (!ruleHref || ruleHref==='__TIMEOUT__'){ hud.markERR(stepFind,'No rule matched for tightening'); continue; }
            hud.markOK(stepFind,'Matched rule');

            const gotRule = await getDraftRule(orgId, ruleHref);
            if (!gotRule.ok || !gotRule.data) continue;

            const stepPut = hud.addStep('Applying tighten…');
            const putRes = await putDraftRuleTightenIpList(gotRule.url, side, analysis.best.href);
            if (!putRes.ok) hud.markERR(stepPut, `PUT failed (${putRes.status})`);
            else { hud.markOK(stepPut,'Tighten accepted'); tightenedAny=true; }
          }
          if (tightenedAny){ const stepUi=hud.addStep('Refreshing UI…'); tryRefreshUI(); hud.markOK(stepUi,'UI refresh triggered'); }
        }
      }

      if (String(final.status).toLowerCase()==='completed' && flowCount===0 && rulesetId){
        const res = await disableRuleByMatchingRow(orgId, rulesetId, {effective:sourcesInclude}, {effective:destinationsInclude}, rowServicePills, hud);
        if (res?.success) hud?.bumpMeter('disabled'); else hud?.bumpMeter('errors');
      }

      if (options.refreshUI && !tightenedAny) tryRefreshUI();
      hud?.bumpMeter('reviewed');
    }catch(e){ logInfo('review_row_exception', String(e?.message||e)); hud?.bumpMeter('errors'); }
  }

  /******************************************************************
   * Per-rule progress for API review (Policies → Rulesets flow)
   ******************************************************************/

  // (Added progress display inside API loop below in reviewRulesetByApi)

  /******************************************************************
   * Per-row 🔍 button
   ******************************************************************/
  function buildRowButtonFromRow(row){
    const editBtn = row.querySelector(EDIT_BUTTON_SELECTOR);
    let btn;
    if (editBtn){
      btn = editBtn.cloneNode(true);
      btn.setAttribute('data-rr','1'); btn.setAttribute('title','Review'); btn.setAttribute('aria-label','Review');
      const txt = btn.querySelector('[data-tid="button-text"]'); if (txt) txt.textContent='Review';
      const useEl = btn.querySelector('svg use');
      if (useEl){
        const spriteHas=id=>!!document.querySelector(`symbol[id="${id.replace('#','')}"]`);
        if (spriteHas('#search')) useEl.setAttribute('xlink:href','#search'); else if (spriteHas('#magnifier')) useEl.setAttribute('xlink:href','#magnifier');
      }
    }else{
      btn = document.createElement('button'); btn.type='button'; btn.className='rr-btn'; btn.setAttribute('data-rr','1');
      btn.setAttribute('title','Review'); btn.setAttribute('aria-label','Review'); btn.textContent='🔍';
    }
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const hud = createHUD();
      hud.setJob(new Date().toISOString().replace('T',' ').replace('Z',''));
      hud.setStatus('Starting…'); hud.setFlowCount('—');
      hud.setMeter('reviewed',0); hud.setMeter('disabled',0); hud.setMeter('skipped',0); hud.setMeter('errors',0);
      const [orgId, rulesetId] = await Promise.all([ getOrgIdFromBackground(40,250), Promise.resolve(getRulesetIdFromHash()) ]);
      if (!orgId) return;
      await reviewOneRow(row, orgId, rulesetId, null, hud, { refreshUI:true });
    });
    return btn;
  }
  function addButtonToRow(row){
    const buttonsCell = row.querySelector(BUTTONS_COL_SELECTOR); if (!buttonsCell) return;
    if (hasRRButton(buttonsCell)) return;
    const btn = buildRowButtonFromRow(row);
    const editBtn = row.querySelector(EDIT_BUTTON_SELECTOR);
    if (editBtn && editBtn.parentElement) editBtn.insertAdjacentElement('afterend', btn);
    else buttonsCell.insertBefore(btn, buttonsCell.firstChild);
  }
  function processGrid(grid){ grid.querySelectorAll(ROW_SELECTOR).forEach(addButtonToRow); }
  function observeGrid(grid){
    if (grid.__rrObserved) return; grid.__rrObserved=true;
    const obs=new MutationObserver(()=>scheduleEnsureAll(200));
    obs.observe(grid,{childList:true,subtree:true});
  }
  function ensureAllowGrids(){
    let grids = Array.from(document.querySelectorAll(GRID_SELECTOR));
    if (!grids.length){
      // Fallback: any comp-grid that looks like rules grid (has columns/rows we expect)
      grids = Array.from(document.querySelectorAll(GRID_FALLBACK_SELECTOR)).filter(g =>
        g.querySelector(`[data-tid="${COL_TID_RULENUMBER}"]`) ||
        g.querySelector(`[data-tid="${COL_TID_CONSUMERS}"]`)  ||
        g.querySelector(`[data-tid="${COL_TID_PROVIDERS}"]`)  ||
        g.querySelector('div[data-tid="comp-grid-row"] > div[data-tid="comp-grid-column-buttons"]')
      );
    }
    if (!grids.length) return false;
    grids.forEach(g=>{ processGrid(g); observeGrid(g); });
    return true;
  }

  /******************************************************************
   * Toolbar duplicate guards (idempotent)
   ******************************************************************/
  const processedDetailGroups = new WeakSet();
  const processedListGroups   = new WeakSet();
  function hasDetailReviewIn(group){
    return !!group.querySelector('[data-rr-tool-wrapper="1"], button[data-rr-tool="1"]');
  }
  function hasListReviewIn(group){
    return !!group.querySelector('[data-rr-tool-list-wrapper="1"], button[data-rr-tool-list="1"]');
  }

  /******************************************************************
   * Toolbar: Ruleset detail “Review” (restored placement)
   ******************************************************************/
  function findRulesetToolgroupCandidates(){
    const groups = Array.from(document.querySelectorAll(TOOLGROUP_SELECTOR));
    return groups.filter(g => g.querySelector(TOOLGROUP_MENU_SEL) && g.querySelector(TOOLGROUP_REFRESH_SEL));
  }
  function buildRulesetReviewButtonFromRefresh(refreshBtn){
    const reviewBtn = refreshBtn.cloneNode(true);
    reviewBtn.setAttribute('data-rr-tool','1');
    reviewBtn.title = 'Review'; reviewBtn.setAttribute('aria-label','Review');
    const textSpan = reviewBtn.querySelector('[data-tid="button-text"]'); if (textSpan) textSpan.textContent='Review';
    const dt = (reviewBtn.getAttribute('data-tid')||'').split(/\s+/).filter(Boolean).filter(t=>t!=='comp-button-refresh');
    if (!dt.includes('rr-comp-button-review')) dt.push('rr-comp-button-review');
    reviewBtn.setAttribute('data-tid', dt.join(' '));
    const useEl = reviewBtn.querySelector('svg use');
    if (useEl){ const spriteHas=id=>!!document.querySelector(`symbol[id="${id.replace('#','')}"]`);
      if (spriteHas('#search')) useEl.setAttribute('xlink:href','#search'); else if (spriteHas('#magnifier')) useEl.setAttribute('xlink:href','#magnifier'); }
    return reviewBtn;
  }
  function addReviewButtonToToolgroup(group){
    // guards
    if (!group) return;
    if (processedDetailGroups.has(group)) return;
    if (hasDetailReviewIn(group)) { processedDetailGroups.add(group); return; }

    const refreshBtn = group.querySelector(TOOLGROUP_REFRESH_SEL); if (!refreshBtn) return;

    const reviewBtn = buildRulesetReviewButtonFromRefresh(refreshBtn);
    const wrapper = document.createElement('div'); wrapper.className='i8'; wrapper.setAttribute('data-tid','elem-toolgroup-item'); wrapper.setAttribute('data-rr-tool-wrapper','1'); wrapper.appendChild(reviewBtn);

    reviewBtn.addEventListener('click', async (e)=>{
      e.preventDefault(); reviewBtn.disabled=true;
      try{
        const hud=createHUD(); hud.setJob(new Date().toISOString().replace('T',' ').replace('Z',''));
        hud.setStatus('Ruleset review starting…'); hud.setFlowCount('—'); hud.setMeter('reviewed',0); hud.setMeter('disabled',0); hud.setMeter('skipped',0); hud.setMeter('errors',0);
        const [orgId, rulesetId] = await Promise.all([ getOrgIdFromBackground(40,250), Promise.resolve(getRulesetIdFromHash()) ]);
        if (!orgId || !rulesetId){ hud.setStatus('Missing org or ruleset'); return; }

        const stepRS=hud.addStep('Checking ruleset pending state…');
        const rs = await fetchRulesetDraftFull(orgId, rulesetId);
        const hasPending = !!(rs && rs.update_type!=null);
        if (hasPending){ hud.markERR(stepRS,'Ruleset has pending changes → skipping all'); hud.setStatus('Skipped (ruleset pending)'); return; }
        hud.markOK(stepRS,'No pending changes');

        const stepScope=hud.addStep('Fetching ruleset scope (draft)…'); const scopeInfo = await fetchRulesetScopeDraft(orgId, rulesetId);
        if (scopeInfo) hud.markOK(stepScope,'Scope loaded'); else hud.markOK(stepScope,'No scope');

        const grid = document.querySelector(GRID_SELECTOR) || document.querySelector(GRID_FALLBACK_SELECTOR);
        if (!grid){ hud.setStatus('No grid'); return; }
        const rows = Array.from(grid.querySelectorAll(ROW_SELECTOR));
        if (!rows.length){ hud.setStatus('Done (no rows)'); return; }

        const total=rows.length;
        for (let i=0;i<total;i++){
          const row=rows[i], rn=getRuleNumber(row) || (i+1);
          hud.setStatus(`Rule ${rn} (${i+1}/${total}) …`);
          const stepRow=hud.addStep(`Rule ${rn} — reviewing…`);
          try{ await reviewOneRow(row,orgId,rulesetId,scopeInfo,hud,{refreshUI:false}); hud.markOK(stepRow,`Rule ${rn} done`);}
          catch{ hud.markERR(stepRow,`Rule ${rn} error`); hud.bumpMeter('errors'); }
        }
        const stepUi=hud.addStep('Refreshing UI…'); tryRefreshUI(); hud.markOK(stepUi,'UI refresh triggered');
        hud.setStatus('Batch review complete');
      }finally{ reviewBtn.disabled=false; }
    });

    const refreshItem = refreshBtn.closest('[data-tid="elem-toolgroup-item"]');
    if (refreshItem && refreshItem.parentElement===group){ refreshItem.insertAdjacentElement('afterend', wrapper); }
    else { group.appendChild(wrapper); }

    processedDetailGroups.add(group);
  }
  function ensureRulesetToolReviewButton(){
    const candidates = findRulesetToolgroupCandidates();
    if (!candidates.length) return false;
    candidates.forEach(addReviewButtonToToolgroup);
    return true;
  }

  /******************************************************************
   * Policies → Rulesets LIST “Review” (restored placement)
   ******************************************************************/
  function findPolicyListToolgroupCandidates(){
    const bars = Array.from(document.querySelectorAll(TOOLBAR_SELECTOR));
    const out=[];
    for (const tb of bars){
      const groups = Array.from(tb.querySelectorAll(TOOLGROUP_SELECTOR));
      for (const g of groups){
        const hasRefresh = !!g.querySelector(TOOLGROUP_REFRESH_SEL);
        const hasExport  = !!g.querySelector(EXPORT_MENU_SEL);
        if (hasRefresh && hasExport) out.push(g);
      }
    }
    return out;
  }
  function buildPolicyListReviewButtonFromRefresh(refreshBtn){
    const reviewBtn = refreshBtn.cloneNode(true);
    reviewBtn.setAttribute('data-rr-tool-list','1');
    reviewBtn.title='Review'; reviewBtn.setAttribute('aria-label','Review');
    const textSpan = reviewBtn.querySelector('[data-tid="button-text"]'); if (textSpan) textSpan.textContent='Review';
    const dt = (reviewBtn.getAttribute('data-tid')||'').split(/\s+/).filter(Boolean).filter(t=>t!=='comp-button-refresh');
    if (!dt.includes('rr-comp-button-review-list')) dt.push('rr-comp-button-review-list');
    reviewBtn.setAttribute('data-tid', dt.join(' '));
    const useEl = reviewBtn.querySelector('svg use');
    if (useEl){ const spriteHas=id=>!!document.querySelector(`symbol[id="${id.replace('#','')}"]`);
      if (spriteHas('#search')) useEl.setAttribute('xlink:href','#search'); else if (spriteHas('#magnifier')) useEl.setAttribute('xlink:href','#magnifier'); }
    return reviewBtn;
  }
  function addReviewButtonToPolicyListToolgroup(group){
    // guards
    if (!group) return;
    if (processedListGroups.has(group)) return;
    if (hasListReviewIn(group)) { processedListGroups.add(group); return; }

    const refreshBtn = group.querySelector(TOOLGROUP_REFRESH_SEL); if (!refreshBtn) return;

    const reviewBtn = buildPolicyListReviewButtonFromRefresh(refreshBtn);
    const wrapper = document.createElement('div'); wrapper.className='i8'; wrapper.setAttribute('data-tid','elem-toolgroup-item'); wrapper.setAttribute('data-rr-tool-list-wrapper','1'); wrapper.appendChild(reviewBtn);

    reviewBtn.addEventListener('click', async (e)=>{
      e.preventDefault(); reviewBtn.disabled=true;
      try{
        const hud=createHUD(); hud.setJob(new Date().toISOString().replace('T',' ').replace('Z',''));
        hud.setStatus('Starting list review (no navigation)…'); hud.setFlowCount('—');
        hud.setMeter('reviewed',0); hud.setMeter('disabled',0); hud.setMeter('skipped',0); hud.setMeter('errors',0);

        const orgId = await getOrgIdFromBackground(40,250); if (!orgId){ hud.setStatus('orgId unavailable'); return; }

        const rootGrid = document.querySelector('div[data-tid="comp-grid"]'); if (!rootGrid){ hud.setStatus('List grid not found'); return; }
        const rows = Array.from(rootGrid.querySelectorAll('div[data-tid="comp-grid-row"]'));
        const selectedRows = rows.filter(r => !!r.querySelector('input[type="checkbox"][data-tid="elem-input"]')?.checked);
        if (!selectedRows.length){ hud.setStatus('No rulesets selected'); return; }

        const pending = selectedRows.filter(r => (r.querySelector('[data-tid="comp-grid-column-status"]')?.textContent||'').toLowerCase().includes('pending'));
        const runnableRows = selectedRows.filter(r => !(r.querySelector('[data-tid="comp-grid-column-status"]')?.textContent||'').toLowerCase().includes('pending'));
        const names = runnableRows.map(r => (r.querySelector('[data-tid="comp-grid-column-name"]')?.textContent||'').trim()).filter(Boolean);
        const nameToId = await mapRulesetNamesToIds(orgId, names);

        const step = hud.addStep('Summary');
        hud.markOK(step, `Selected: ${selectedRows.length} — Skipped (pending): ${pending.length} — Ready: ${names.length}`);

        for (let i=0;i<names.length;i++){
          const name = names[i];
          const rulesetId = nameToId.get(name);
          if (!rulesetId) { const s = hud.addStep(`Resolve ID: ${name}`); hud.markERR(s, 'not found'); hud.bumpMeter('errors'); continue; }
          hud.setStatus(`(${i+1}/${names.length}) Review ruleset: ${name} (#${rulesetId})`);
          await reviewRulesetByApi(orgId, rulesetId, hud);
          await sleep(180);
        }

        const stepUi=hud.addStep('Refreshing UI…'); tryRefreshUI(); hud.markOK(stepUi,'UI refresh triggered');
        hud.setStatus('List review complete (no navigation)');
      }finally{ reviewBtn.disabled=false; }
    });

    const refreshItem = refreshBtn.closest('[data-tid="elem-toolgroup-item"]');
    if (refreshItem && refreshItem.parentElement===group){ refreshItem.insertAdjacentElement('afterend', wrapper); }
    else { group.appendChild(wrapper); }

    processedListGroups.add(group);
  }
  function ensurePolicyListReviewButton(){
    const candidates = findPolicyListToolgroupCandidates();
    if (!candidates.length) return false;
    candidates.forEach(addReviewButtonToPolicyListToolgroup);
    return true;
  }

  /******************************************************************
   * API list review helpers (no-mix AMS + scope behavior)
   ******************************************************************/
  function makeActorsAll(){ return { actors: ACTORS_TOKEN }; }
  async function fetchRulesetsDraftList(orgId, page=1, perPage=500){
    const url = `${location.origin}/api/v2/orgs/${orgId}/sec_policy/draft/rule_sets?page=${page}&per_page=${perPage}`;
    const res = await fetch(url,{credentials:'include',headers:{Accept:'application/json'}}); if (!res.ok) return { items:[], total:0 };
    const arr = await res.json().catch(()=>[]); const total = Number(res.headers.get('X-Total-Count')) || (Array.isArray(arr)?arr.length:0);
    return { items:Array.isArray(arr)?arr:[], total };
  }
  async function mapRulesetNamesToIds(orgId, names){
    const wanted=new Set(names), map=new Map(); let page=1, perPage=500;
    while (wanted.size>0 && page<=50){
      const { items } = await fetchRulesetsDraftList(orgId,page,perPage); if (!items.length) break;
      for (const it of items){
        const name=(it?.name||'').trim(); if (!name || !wanted.has(name)) continue;
        const m=/\/rule_sets\/(\d+)\b/.exec(it?.href||''); if (m){ map.set(name, m[1]); wanted.delete(name); }
      }
      page++;
    }
    return map;
  }
  function apiEntitiesToInclude(consumers, unscoped, providers){
    // Sources: AMS only if no concrete entities present (no mixing)
    const src = [];
    (consumers||[]).forEach(c=>{
      if (c?.workload?.href) src.push({ workload:{ href:c.workload.href } });
      else if (c?.label?.href) src.push({ label:{ href:c.label.href } });
      else if (c?.ip_list?.href) src.push({ ip_list:{ href:c.ip_list.href } });
    });
    if (unscoped===true && src.length===0) src.push(makeActorsAll());

    // Destinations: don't mix AMS with concrete providers
    const dst = [];
    let hadActors=false;
    (providers||[]).forEach(p=>{
      if (p?.actors){ hadActors=true; }
      else if (p?.workload?.href) dst.push({ workload:{ href:p.workload.href } });
      else if (p?.label?.href)    dst.push({ label:{ href:p.label.href } });
      else if (p?.ip_list?.href)  dst.push({ ip_list:{ href:p.ip_list.href } });
    });
    if (hadActors && dst.length===0) dst.push(makeActorsAll());

    const sourcesInclude      = src.length ? [src] : [[]];
    const destinationsInclude = dst.length ? [dst] : [[]];

    const srcHasIpList = (consumers||[]).some(c=>!!c?.ip_list);
    const dstHasIpList = (providers||[]).some(p=>!!p?.ip_list);

    return { sourcesInclude, destinationsInclude, srcHasIpList, dstHasIpList, hadActors };
  }
  function applyScopeActorsToDest(destinationsInclude, scopeLabelEntities){
    if (!Array.isArray(destinationsInclude) || !Array.isArray(destinationsInclude[0])) return destinationsInclude;
    const base = destinationsInclude[0]; if (!base.length) return destinationsInclude;
    const hasActors = base.some(e=>e && e.actors); if (!hasActors) return destinationsInclude;

    const nonActors = base.filter(e=>!e.actors);
    if (nonActors.length===0) return [ scopeLabelEntities.slice() ];

    const dedupe=new Set(nonActors.map(e=>JSON.stringify(e)));
    for (const se of scopeLabelEntities){ const key=JSON.stringify(se); if (!dedupe.has(key)){ dedupe.add(key); nonActors.push(se); } }
    return [ nonActors ];
  }
  async function servicesIncludeFromRule(rule, orgId){
    const include=[], seen=new Set();
    for (const s of (rule.ingress_services||[])){
      const raw = Array.isArray(s.service_ports)? s.service_ports : (Array.isArray(s.ports)? s.ports : null);
      if (raw){
        raw.map(normalizePort).filter(Boolean).forEach(p=>{ const key=dedupKey(p); if(!seen.has(key)){ seen.add(key); include.push(p); } });
      }else if (s.href){
        const m=/\/services\/(\d+)/.exec(s.href);
        if (m){ try{ const ports=await fetchServicePortsActive(orgId,m[1]);
                      ports.forEach(p=>{ const key=dedupKey(p); if(!seen.has(key)){ seen.add(key); include.push(p); } }); }
               catch(e){ console.warn('[RR] service fetch (rule) failed', m[1], e); } }
      }else if (Number.isFinite(s.port) || Number.isFinite(s.proto)){
        const sp=normalizePort(s); if (sp){ const key=dedupKey(sp); if(!seen.has(key)){ seen.add(key); include.push(sp); } }
      }
    }
    return include;
  }
  async function reviewRulesetByApi(orgId, rulesetId, hud){
    const stepRS=hud.addStep(`Ruleset #${rulesetId}: check pending…`);
    const rs = await fetchRulesetDraftFull(orgId, rulesetId);
    const hasPending = !!(rs && rs.update_type!=null);
    if (hasPending){ hud.markERR(stepRS,'Pending changes → skip ruleset'); hud.bumpMeter('skipped'); logInfo('list_skip_pending_ruleset',{ruleset_id:rulesetId}); return; }
    hud.markOK(stepRS,'OK');

    const scopeInfo = await fetchRulesetScopeDraft(orgId, rulesetId);
    const scopeLabelHrefs = (scopeInfo?.clauses||[]).reduce((acc,cl)=>{ for (const h of cl) acc.add(h); return acc; }, new Set());
    const scopeLabelEntities = scopeLabelsToEntities([...scopeLabelHrefs]);

    const rules = await fetchDraftRules(orgId, rulesetId);
    if (!rules.length){ const s=hud.addStep('No rules'); hud.markOK(s,'0 rules'); return; }

    let idx=0;
    for (const rule of rules){
      idx++;
      const total = rules.length;
      const displayNum = rule.rule_number || idx;

      logInfo('api_rule_snapshot',{
        ruleset_id:rulesetId, index:idx, rule_number:rule.rule_number, enabled:rule.enabled===true,
        consumers_count:Array.isArray(rule.consumers)?rule.consumers.length:0,
        providers_count:Array.isArray(rule.providers)?rule.providers.length:0,
        ingress_services_count:Array.isArray(rule.ingress_services)?rule.ingress_services.length:0
      });
      logHeavy('api_rule_raw',{consumers:rule.consumers||[], providers:rule.providers||[], ingress_services:rule.ingress_services||[], unscoped_consumers:!!rule.unscoped_consumers});

      if (rule.enabled!==true){ hud.bumpMeter('skipped'); logInfo('list_skip_disabled_rule',{ruleset_id:rulesetId, rule_number:rule.rule_number}); continue; }

      // 🆕 Progress in HUD status for API loop
      hud.setStatus(`Rule ${displayNum} (${idx}/${total}) …`);

      const { sourcesInclude, destinationsInclude, srcHasIpList, dstHasIpList, hadActors } =
        apiEntitiesToInclude(rule.consumers, rule.unscoped_consumers, rule.providers);

      const srcInc = sourcesInclude; // AMS only if alone (no mixing)
      const dstInc = hadActors ? applyScopeActorsToDest(destinationsInclude, scopeLabelEntities) : destinationsInclude;
      const servicesInc = await servicesIncludeFromRule(rule, orgId);

      logHeavy('api_rule_includes',{
        ruleset_id:rulesetId, rule_number:rule.rule_number||idx,
        sources_effective:includeToStrings(srcInc),
        destinations_effective:includeToStrings(dstInc),
        services_effective:servicesToStrings(servicesInc),
        flags:{ srcHasIpList, dstHasIpList, dstHadActors:hadActors }
      });

      const payload = buildPayloadSkeleton();
      payload.sources.include      = srcInc;
      payload.destinations.include = dstInc;
      payload.services.include     = servicesInc;

      // 🆕 Include progress in step label
      const stepRun = hud.addStep(`Rule ${displayNum} (${idx}/${total}): query…`);
      const createResp = await submitAsyncTrafficQuery(orgId, payload);
      logInfo('async_query_create_outcome',{ruleset_id:rulesetId, rule_number:rule.rule_number||idx, ok:createResp.ok, status:createResp.status, href:createResp?.data?.href||null});
      if (!createResp.ok || !createResp?.data?.href){ hud.markERR(stepRun,`create ${createResp.status}`); hud.bumpMeter('errors'); continue; }

      const final = await pollAsyncQuery(orgId, createResp.data.href, {maxWaitMs:15*60*1000, minDelayMs:750, maxDelayMs:5000}, hud);
      if (!final){ hud.markERR(stepRun,'poll timeout'); hud.bumpMeter('errors'); continue; }

      logInfo('async_query_final_summary',{ruleset_id:rulesetId, rule_number:rule.rule_number||idx, status:final?.status, flows_count:final?.flows_count, matches_count:final?.matches_count});
      const flowCount = Number(final?.flows_count ?? final?.matches_count ?? 0);
      hud.markOK(stepRun, `flows=${flowCount}`);

      if ((srcHasIpList || dstHasIpList) && final?.result && flowCount>0){
        const got = await downloadAsyncQuery(final.result);
        let flowsJson = got?.json || null; if (!flowsJson && got?.text){ try{ const parsed=JSON.parse(got.text); if (Array.isArray(parsed)) flowsJson=parsed; }catch{} }
        if (Array.isArray(flowsJson) && flowsJson.length>0){
          const sidesToAnalyze=[]; if (srcHasIpList) sidesToAnalyze.push('src'); if (dstHasIpList) sidesToAnalyze.push('dst');
          for (const side of sidesToAnalyze){
            const analysis = analyzeCommonIpList(flowsJson, side);
            if (!analysis?.best) continue;
            const ruleHref = rule?.href || `/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}/sec_rules/${rule.id}`;
            const gotRule = await getDraftRule(orgId, ruleHref); if (!gotRule.ok || !gotRule.data) continue;

            // 🆕 Progress included in tighten step
            const stepT = hud.addStep(`Rule ${displayNum} (${idx}/${total}) — Tighten ${side} → ${analysis.best.name || analysis.best.href}`);
            const putRes = await putDraftRuleTightenIpList(gotRule.url, side, analysis.best.href);
            if (!putRes.ok){ hud.markERR(stepT,`PUT ${putRes.status}`); hud.bumpMeter('errors'); } else hud.markOK(stepT,'tightened');
          }
        }
      }

      if (String(final.status).toLowerCase()==='completed' && flowCount===0){
        const href = rule?.href || `/orgs/${orgId}/sec_policy/draft/rule_sets/${rulesetId}/sec_rules/${rule.id}`;
        const gotRule = await getDraftRule(orgId, href);
        if (gotRule.ok && gotRule.data){
          // 🆕 Progress included in disable step
          const stepD = hud.addStep(`Rule ${displayNum} (${idx}/${total}) — Disable…`);
          const putRes = await putDraftRuleEnabledFalse(gotRule.url, gotRule.data, orgId);
          if (!putRes.ok){ hud.markERR(stepD,`PUT ${putRes.status}`); hud.bumpMeter('errors'); }
          else{
            const conf = await confirmDisabled(gotRule.url);
            if (conf.ok && conf.enabled===false){ hud.markOK(stepD,'disabled'); hud.bumpMeter('disabled'); }
            else { hud.markERR(stepD,'confirm failed'); hud.bumpMeter('errors'); }
          }
        }
      }

      hud.bumpMeter('reviewed');
      await sleep(120);
    }
  }

  /******************************************************************
   * Bootstrap (TDZ-safe)
   ******************************************************************/
  function init(){
    // TDZ-safe: defer first CSS ensure so CSS_BTN is guaranteed initialized
    setTimeout(ensureCssOnce, 0);

    scheduleEnsureAll(0);

    const docObs = new MutationObserver(()=>scheduleEnsureAll(200));
    docObs.observe(document.documentElement,{childList:true,subtree:true});

    let attempts=0;
    const timer=setInterval(()=>{ attempts++; scheduleEnsureAll(0); if (attempts>=8) clearInterval(timer); }, 300);

    window.addEventListener('hashchange', ()=>scheduleEnsureAll(0));
  }
  if (document.readyState==='complete' || document.readyState==='interactive') init();
  else window.addEventListener('DOMContentLoaded', init);

})();