export function buildOperatorConsoleHtml(version) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consola Operador - Immersphere v${version}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;padding:24px}
h1{font-size:1.1rem;font-weight:700;letter-spacing:.04em;color:#a78bfa;margin-bottom:4px}
.sub{font-size:.75rem;color:#64748b;margin-bottom:24px}
.card{background:#1e2130;border:1px solid #2d3148;border-radius:8px;padding:20px;margin-bottom:16px}
.card h2{font-size:.85rem;font-weight:600;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em}
.field{margin-bottom:10px}
label{display:block;font-size:.75rem;color:#94a3b8;margin-bottom:4px}
input,textarea{width:100%;background:#131623;border:1px solid #2d3148;border-radius:4px;color:#e2e8f0;font-size:.85rem;padding:8px 10px;outline:none;font-family:inherit}
input:focus,textarea:focus{border-color:#6366f1}
textarea{resize:vertical;min-height:160px;font-family:ui-monospace,monospace;font-size:.75rem}
.btn{display:inline-block;padding:8px 16px;border-radius:4px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;transition:opacity .15s}
.btn-primary{background:#6366f1;color:#fff}
.btn-secondary{background:#1e2130;color:#a78bfa;border:1px solid #6366f1}
.btn-danger{background:#7f1d1d;color:#fca5a5}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.status{font-size:.75rem;padding:6px 10px;border-radius:4px;margin-bottom:8px;display:none}
.status.ok{background:#052e16;color:#86efac;border:1px solid #166534;display:block}
.status.err{background:#450a0a;color:#fca5a5;border:1px solid #7f1d1d;display:block}
.status.warn{background:#431407;color:#fdba74;border:1px solid #c2410c;display:block}
.status.info{background:#0c1a2e;color:#93c5fd;border:1px solid #1d4ed8;display:block}
pre{background:#0a0c14;border:1px solid #2d3148;border-radius:4px;padding:12px;font-size:.72rem;overflow:auto;max-height:320px;color:#a5b4fc;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-all}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
#console-section{display:none}
.session-bar{font-size:.72rem;color:#64748b;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:8px 12px;background:#1a1d2e;border-radius:4px}
</style>
</head>
<body>
<h1>Consola Operador Immersphere</h1>
<p class="sub">v${version} - Acceso restringido - No compartir este panel</p>

<div id="login-section">
  <div class="card">
    <h2>Autenticacion</h2>
    <p style="font-size:.78rem;color:#64748b;margin-bottom:14px">Introduce el token de operador configurado en la variable OPERATOR_ADMIN_TOKEN del servidor.</p>
    <div class="field">
      <label>Token de operador</label>
      <input type="password" id="op-token" placeholder="************" autocomplete="current-password">
    </div>
    <div id="login-status" class="status"></div>
    <div class="row">
      <button class="btn btn-primary" onclick="doLogin()">Iniciar sesion</button>
    </div>
  </div>
</div>

<div id="console-section">
  <div class="session-bar">
    <span>Sesion activa <span id="session-expiry"></span></span>
    <button class="btn btn-danger" style="padding:4px 10px;font-size:.72rem" onclick="doLogout()">Cerrar sesion</button>
  </div>

  <div class="card">
    <h2>Estado del sistema</h2>
    <div id="caps-status" class="status info">Cargando capacidades...</div>
    <pre id="caps-output" style="display:none"></pre>
    <div class="row">
      <button class="btn btn-secondary" onclick="loadCapabilities()">Recargar capacidades</button>
    </div>
  </div>

  <div class="card">
    <h2>Four Hooks Production Package</h2>
    <p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Pega aqui el Production Package JSON generado desde la ficha CRM. No incluye tokens ni credenciales.</p>
    <div class="field">
      <label>Production Package JSON</label>
      <textarea id="pkg-input" placeholder='{"lead":{"slug":"cliente-ejemplo",...}}'></textarea>
    </div>
    <div id="pkg-status" class="status"></div>
    <div class="row">
      <button class="btn btn-secondary" onclick="doValidateJson()">Validar JSON</button>
      <button class="btn btn-secondary" onclick="doProposalPackage()">Generar proposal-package</button>
      <button class="btn btn-secondary" onclick="doPrPlan()">Generar PR plan</button>
      <button class="btn btn-secondary" onclick="doPreflight()">Ejecutar GitHub preflight</button>
      <button class="btn btn-primary" onclick="doCreatePrs()">Crear PRs en GitHub</button>
      <button class="btn btn-primary" onclick="copyResponseBundle()">Copiar Response Bundle para CRM</button>
      <button class="btn btn-danger" onclick="clearPackage()">Limpiar</button>
    </div>
    <div class="status warn" style="display:block;margin-top:10px">Crear PRs escribe ramas y pull requests reales en GitHub. Ejecuta primero el preflight y revisa que no haya blockers.</div>
  </div>

  <div class="card" id="result-card">
    <h2>Resultados</h2>
    <div id="result-status" class="status"></div>
    <div class="field"><label>Proposal Package result</label><pre id="proposal-output">Pendiente.</pre></div>
    <div class="field"><label>PR Plan result</label><pre id="plan-output">Pendiente.</pre></div>
    <div class="field"><label>GitHub Preflight result</label><pre id="preflight-output">Pendiente.</pre></div>
    <div class="field"><label>Create PRs result</label><pre id="create-prs-output">Pendiente.</pre></div>
    <div class="field"><label>Response Bundle final</label><pre id="bundle-output">Pendiente.</pre></div>
  </div>
</div>

<script>
var _csrf = null;
var _proposalPackage = null;
var _prPlan = null;
var _githubPreflight = null;
var _createPrsResult = null;
var _leadSlug = "";

function show(id,msg,type){var el=document.getElementById(id);el.textContent=msg;el.className='status '+type;}
function writeJson(id,data){document.getElementById(id).textContent=JSON.stringify(data,null,2);}
function buildResponseBundle(){
  if(_createPrsResult&&_createPrsResult.responseBundle){return _createPrsResult.responseBundle;}
  var prPlan=_prPlan||{};
  var preflight=_githubPreflight||{};
  var pullRequests=null;
  var status="dry_run_ok";
  var plannedPublicRoutes=prPlan.plannedPublicRoutes||{};
  if(preflight.pullRequests){pullRequests=preflight.pullRequests;}
  return{
    schemaVersion:"operator-response-bundle/1.0",
    source:"operator-console",
    generatedAt:new Date().toISOString(),
    slug:_leadSlug||prPlan.leadSlug||(_proposalPackage&&_proposalPackage.leadSlug)||"",
    leadSlug:_leadSlug||prPlan.leadSlug||(_proposalPackage&&_proposalPackage.leadSlug)||"",
    status:status,
    jobId:prPlan.jobId||null,
    plannedPublicRoutes:plannedPublicRoutes,
    pullRequests:pullRequests,
    proposalPackage:_proposalPackage,
    prPlan:_prPlan,
    githubPreflight:_githubPreflight,
    warnings:[
      "dry_run_ok: PRs not created from this console; publication remains pending until create-prs/merge."
    ]
  };
}
function refreshBundle(){writeJson('bundle-output',buildResponseBundle());}
function parsePackage(){
  var raw=document.getElementById('pkg-input').value.trim();
  if(!raw){show('pkg-status','Pega el Production Package JSON primero','err');return null;}
  try{var pkg=JSON.parse(raw);_leadSlug=(pkg.lead&&pkg.lead.slug)||'';return pkg;}catch(e){show('pkg-status','JSON invalido: '+e.message,'err');return null;}
}
async function apiPost(path,body){
  var headers={'Content-Type':'application/json'};
  if(_csrf) headers['x-csrf-token']=_csrf;
  var res=await fetch(path,{method:'POST',headers:headers,credentials:'include',body:JSON.stringify(body)});
  return res.json();
}
async function doLogin(){
  var token=document.getElementById('op-token').value.trim();
  if(!token){show('login-status','Introduce el token','warn');return;}
  show('login-status','Autenticando...','info');
  try{
    var res=await fetch('/api/operator/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({token:token})});
    var data=await res.json();
    if(data.ok){
      _csrf=data.csrfToken;
      document.getElementById('session-expiry').textContent='(expira '+new Date(data.expiresAt).toLocaleTimeString()+')';
      document.getElementById('login-section').style.display='none';
      document.getElementById('console-section').style.display='block';
      loadCapabilities();
    }else{
      show('login-status',data.error||'Token incorrecto','err');
    }
  }catch(e){show('login-status','Error de red: '+e.message,'err');}
}
async function doLogout(){
  try{await apiPost('/api/operator/logout',{});}catch(e){}
  _csrf=null;_proposalPackage=null;_prPlan=null;_githubPreflight=null;_createPrsResult=null;_leadSlug='';
  document.getElementById('login-section').style.display='block';
  document.getElementById('console-section').style.display='none';
  document.getElementById('op-token').value='';
}
async function loadCapabilities(){
  show('caps-status','Cargando...','info');
  try{
    var res=await fetch('/api/production/capabilities',{credentials:'include'});
    var data=await res.json();
    document.getElementById('caps-output').style.display='block';
    document.getElementById('caps-output').textContent=JSON.stringify(data,null,2);
    var msg='Backend OK - PR automation '+(data.prAutomationEnabled?'ACTIVADA':'DESACTIVADA')+' - CRM directo: '+(data.crmDirectConnection?'SI':'NO');
    show('caps-status',msg,data.prAutomationEnabled?'ok':'warn');
  }catch(e){show('caps-status','No se pudo conectar con el backend: '+e.message,'err');}
}
function doValidateJson(){
  var pkg=parsePackage();if(!pkg)return;
  var missing=[];
  if(!pkg.lead||!pkg.lead.slug) missing.push('lead.slug');
  if(!pkg.targetRoutes) missing.push('targetRoutes');
  if(!pkg.hooks) missing.push('hooks');
  if(!pkg.mediaAssets) missing.push('mediaAssets');
  if(missing.length){show('pkg-status','JSON parseado, faltan campos: '+missing.join(', '),'warn');}
  else{show('pkg-status','JSON valido para enviar a Operator Console. Lead: '+(pkg.lead.name||pkg.lead.slug),'ok');}
  refreshBundle();
}
async function doProposalPackage(){
  var pkg=parsePackage();if(!pkg)return;
  show('pkg-status','Generando proposal-package...','info');
  try{
    var data=await apiPost('/api/operator/proposal-package',pkg);
    _proposalPackage=data;_leadSlug=data.leadSlug||_leadSlug;
    writeJson('proposal-output',data);refreshBundle();
    show('result-status',data.ok?'proposal-package OK':'proposal-package bloqueado',data.ok?'ok':'err');
    show('pkg-status',data.ok?'proposal-package generado (sin escritura)':'proposal-package bloqueado: '+((data.validation&&data.validation.errors)||[]).join(', '),data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');}
}
async function doPrPlan(){
  var pkg=parsePackage();if(!pkg)return;
  show('pkg-status','Generando PR plan...','info');
  try{
    var data=await apiPost('/api/operator/pr-plan',pkg);
    _prPlan=data;_leadSlug=data.leadSlug||_leadSlug;
    writeJson('plan-output',data);refreshBundle();
    show('result-status',data.ok?'PR plan OK':'PR plan bloqueado',data.ok?'ok':'err');
    show('pkg-status',data.ok?'PR plan generado (sin escritura)':'Plan bloqueado: '+((data.validation&&data.validation.errors)||[]).join(', '),data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');}
}
async function doPreflight(){
  var pkg=parsePackage();if(!pkg)return;
  show('pkg-status','Ejecutando preflight...','info');
  try{
    var data=await apiPost('/api/operator/github-preflight',pkg);
    _githubPreflight=data;_leadSlug=data.leadSlug||_leadSlug;
    writeJson('preflight-output',data);refreshBundle();
    if(data.ok&&data.canCreatePRs){show('pkg-status','Preflight OK. Ya puedes crear PRs reales en GitHub.','ok');}
    else{var blockers=(data.blockers||[]).join(', ')||'bloqueado';show('pkg-status','Preflight bloqueado: '+blockers,'err');}
    show('result-status',data.ok?'preflight OK':'preflight bloqueado',data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');}
}
async function doCreatePrs(){
  var pkg=parsePackage();if(!pkg)return;
  if(!_githubPreflight||!_githubPreflight.canCreatePRs){
    show('pkg-status','Ejecuta GitHub preflight OK antes de crear PRs.','warn');
    return;
  }
  var slug=(pkg.lead&&pkg.lead.slug)||_leadSlug||'este lead';
  var ok=confirm('Vas a crear ramas y PRs reales en GitHub para '+slug+'.\\n\\nContinua solo si el preflight no tiene blockers. ¿Crear PRs ahora?');
  if(!ok)return;
  show('pkg-status','Creando PRs reales en GitHub...','info');
  try{
    var data=await apiPost('/api/operator/create-prs',pkg);
    _createPrsResult=data;_leadSlug=data.leadSlug||_leadSlug;
    writeJson('create-prs-output',data);refreshBundle();
    if(data.ok&&data.responseBundle){
      show('result-status','create-prs OK. Copia el Response Bundle real al CRM.','ok');
      show('pkg-status','PRs creados. Copia Response Bundle para CRM.','ok');
    }else{
      var blockers=(data.blockers||[]).join(', ')||data.reason||data.error||'create-prs bloqueado';
      show('result-status','create-prs no completado: '+blockers,'err');
      show('pkg-status','create-prs no completado: '+blockers,'err');
    }
  }catch(e){show('pkg-status','Error creando PRs: '+e.message,'err');}
}
async function copyResponseBundle(){
  var bundle=buildResponseBundle();
  if(!bundle.proposalPackage&&!bundle.prPlan&&!bundle.githubPreflight&&!_createPrsResult){show('pkg-status','Genera al menos un resultado antes de copiar el bundle','warn');return;}
  var text=JSON.stringify(bundle,null,2);
  try{await navigator.clipboard.writeText(text);}catch(e){var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
  show('pkg-status','Response Bundle copiado para CRM','ok');
}
function clearPackage(){
  document.getElementById('pkg-input').value='';
  _proposalPackage=null;_prPlan=null;_githubPreflight=null;_leadSlug='';
  document.getElementById('proposal-output').textContent='Pendiente.';
  document.getElementById('plan-output').textContent='Pendiente.';
  document.getElementById('preflight-output').textContent='Pendiente.';
  document.getElementById('create-prs-output').textContent='Pendiente.';
  document.getElementById('bundle-output').textContent='Pendiente.';
  _createPrsResult=null;
  show('pkg-status','Panel limpio.','info');
}
(async function checkSession(){
  try{
    var res=await fetch('/api/operator/session',{credentials:'include'});
    var data=await res.json();
    if(data.ok&&data.authenticated){
      _csrf=data.csrfToken;
      document.getElementById('session-expiry').textContent='(expira '+new Date(data.expiresAt).toLocaleTimeString()+')';
      document.getElementById('login-section').style.display='none';
      document.getElementById('console-section').style.display='block';
      loadCapabilities();
    }
  }catch(e){}
})();
</script>
</body>
</html>`;
}
