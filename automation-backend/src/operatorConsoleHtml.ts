export function buildOperatorConsoleHtml(version) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consola Operador — Immersphere v${version}</title>
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
textarea{resize:vertical;min-height:120px;font-family:ui-monospace,monospace;font-size:.75rem}
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
#login-section{}
#console-section{display:none}
.session-bar{font-size:.72rem;color:#64748b;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:8px 12px;background:#1a1d2e;border-radius:4px}
.badge{padding:2px 8px;border-radius:3px;font-size:.68rem;font-weight:700}
.badge-ok{background:#052e16;color:#86efac}
.badge-off{background:#1c1917;color:#a8a29e}
</style>
</head>
<body>
<h1>Consola Operador Immersphere</h1>
<p class="sub">v${version} · Acceso restringido · No compartir este panel</p>

<div id="login-section">
  <div class="card">
    <h2>Autenticación</h2>
    <p style="font-size:.78rem;color:#64748b;margin-bottom:14px">Introduce el token de operador configurado en la variable OPERATOR_ADMIN_TOKEN del servidor.</p>
    <div class="field">
      <label>Token de operador</label>
      <input type="password" id="op-token" placeholder="••••••••••••" autocomplete="current-password">
    </div>
    <div id="login-status" class="status"></div>
    <div class="row">
      <button class="btn btn-primary" onclick="doLogin()">Iniciar sesión</button>
    </div>
  </div>
</div>

<div id="console-section">
  <div class="session-bar">
    <span>Sesión activa <span id="session-expiry"></span></span>
    <button class="btn btn-danger" style="padding:4px 10px;font-size:.72rem" onclick="doLogout()">Cerrar sesión</button>
  </div>

  <div class="card">
    <h2>Estado del sistema</h2>
    <div id="caps-status" class="status info">Cargando capacidades…</div>
    <pre id="caps-output" style="display:none"></pre>
    <div class="row">
      <button class="btn btn-secondary" onclick="loadCapabilities()">Recargar capacidades</button>
    </div>
  </div>

  <div class="card">
    <h2>Paquete de producción (Production Package JSON)</h2>
    <p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Pega aquí el JSON del paquete copiado desde la ficha CRM. No incluye tokens ni credenciales.</p>
    <div class="field">
      <label>Production Package JSON</label>
      <textarea id="pkg-input" placeholder='{"lead":{"slug":"cliente-ejemplo",...}}'></textarea>
    </div>
    <div id="pkg-status" class="status"></div>
    <div class="row">
      <button class="btn btn-secondary" onclick="doPreflight()">Preflight (sin escritura)</button>
      <button class="btn btn-secondary" onclick="doPrPlan()">PR Plan (sin escritura)</button>
      <button class="btn btn-primary" id="btn-create" onclick="doCreatePRs()" disabled>Crear PRs (escritura real)</button>
    </div>
  </div>

  <div class="card" id="result-card" style="display:none">
    <h2>Resultado</h2>
    <div id="result-status" class="status"></div>
    <pre id="result-output"></pre>
    <div class="row" id="pr-links"></div>
  </div>
</div>

<script>
var _csrf = null;
var _preflightOk = false;

function show(id,msg,type){var el=document.getElementById(id);el.textContent=msg;el.className='status '+type;}
function showResult(data,type){
  var card=document.getElementById('result-card');
  var out=document.getElementById('result-output');
  card.style.display='block';
  show('result-status',data.ok?'OK':'Error: '+(data.reason||data.error||JSON.stringify(data.validation?.errors||[])),type);
  out.textContent=JSON.stringify(data,null,2);
  var links=document.getElementById('pr-links');
  links.innerHTML='';
  if(data.pullRequests){
    Object.values(data.pullRequests).forEach(function(pr){
      if(pr.url){var a=document.createElement('a');a.href=pr.url;a.target='_blank';a.className='btn btn-secondary';a.textContent='Abrir PR #'+pr.number;links.appendChild(a);}
    });
  }
}
function parsePackage(){
  var raw=document.getElementById('pkg-input').value.trim();
  if(!raw){show('pkg-status','Pega el Production Package JSON primero','err');return null;}
  try{return JSON.parse(raw);}catch(e){show('pkg-status','JSON inválido: '+e.message,'err');return null;}
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
  show('login-status','Autenticando…','info');
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
  _csrf=null;_preflightOk=false;
  document.getElementById('login-section').style.display='block';
  document.getElementById('console-section').style.display='none';
  document.getElementById('op-token').value='';
}
async function loadCapabilities(){
  show('caps-status','Cargando…','info');
  try{
    var res=await fetch('/api/production/capabilities',{credentials:'include'});
    var data=await res.json();
    document.getElementById('caps-output').style.display='block';
    document.getElementById('caps-output').textContent=JSON.stringify(data,null,2);
    var msg='Backend OK — PR automation '+(data.prAutomationEnabled?'ACTIVADA':'DESACTIVADA')+' · CRM directo: '+(data.crmDirectConnection?'SÍ':'NO');
    show('caps-status',msg,data.prAutomationEnabled?'ok':'warn');
  }catch(e){show('caps-status','No se pudo conectar con el backend: '+e.message,'err');}
}
async function doPreflight(){
  var pkg=parsePackage();if(!pkg)return;
  show('pkg-status','Ejecutando preflight…','info');
  _preflightOk=false;
  document.getElementById('btn-create').disabled=true;
  try{
    var data=await apiPost('/api/operator/github-preflight',pkg);
    if(data.ok&&data.canCreatePRs){
      _preflightOk=true;
      document.getElementById('btn-create').disabled=false;
      show('pkg-status','Preflight OK — listo para crear PRs','ok');
    }else{
      var blockers=(data.blockers||[]).join(', ')||'bloqueado';
      show('pkg-status','Preflight bloqueado: '+blockers,'err');
    }
    showResult(data,data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');}
}
async function doPrPlan(){
  var pkg=parsePackage();if(!pkg)return;
  show('pkg-status','Generando PR plan…','info');
  try{
    var data=await apiPost('/api/operator/pr-plan',pkg);
    showResult(data,data.ok?'ok':'err');
    show('pkg-status',data.ok?'PR plan generado (sin escritura)':'Plan bloqueado: '+(data.validation?.errors||[]).join(', '),data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');}
}
async function doCreatePRs(){
  if(!_preflightOk){show('pkg-status','Ejecuta preflight primero','warn');return;}
  var pkg=parsePackage();if(!pkg)return;
  if(!confirm('¿Crear PRs en GitHub? Esta acción escribe en los repositorios. Se requiere revisión humana antes del merge.')){return;}
  show('pkg-status','Creando PRs en GitHub…','info');
  document.getElementById('btn-create').disabled=true;
  _preflightOk=false;
  try{
    var data=await apiPost('/api/operator/create-prs',pkg);
    showResult(data,data.ok?'ok':'err');
    show('pkg-status',data.ok?'PRs creados — pendientes de revisión humana':'Error al crear PRs: '+(data.error||data.reason||''),data.ok?'ok':'err');
  }catch(e){show('pkg-status','Error: '+e.message,'err');document.getElementById('btn-create').disabled=false;}
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
