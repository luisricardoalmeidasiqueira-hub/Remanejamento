'use strict';
const FIREBASE_CONFIG = {
apiKey: 'AIzaSyChZp2bseKgHuo97i6A_XFe1StEcBhcDkE',
authDomain: 'cofre-seguro-2642d.firebaseapp.com',
projectId: 'cofre-seguro-2642d',
storageBucket: 'cofre-seguro-2642d.firebasestorage.app',
messagingSenderId: '1076024528728',
appId: '1:1076024528728:web:86144287862e7a81a31f2d'
};
const firebaseReady = true;
const ADMIN_COLLECTION = 'admins';
const USERS_COLLECTION = 'usuarios';
const PRIMARY_ADMIN_EMAIL = 'luissiqueir@hotmail.com';
let isAdmin = false;
let adminEmail = '';
let firebaseDB = null;
let firebaseUser = null;
let firebaseUnsubscribe = null;
let firebaseModules = null;
let cloudApplying = false;
function setCloudStatus(text, kind=''){
const el=$('cloudStatus');
if(!el)return;
el.textContent=text;
el.className='cloud-status'+(kind?' '+kind:'');
}
// Indicador no topo: ☁️ + bolinha. 🟢 sincronizado · 🟡 verificando · 🟠 salvo só no aparelho · 🔴 não conectou
const CONEXAO_INFO={
verde:['🟢','Tudo certo','Conectado ao Firebase e sincronizado.'],
amarelo:['🟡','Verificando','Conectando ou conferindo os dados com o Firebase.'],
laranja:['🟠','Salvo só no aparelho','Sem internet ou envio pendente. Fica guardado no celular e sobe sozinho quando conectar.'],
vermelho:['🔴','Não conectou','Não foi possível conectar ao Firebase. Toque em 🔄 Atualizar app ou tente mais tarde.']
};
let conexaoAtual='amarelo';
function setConexao(estado){
const badge=$('conexaoBadge'); if(!badge)return;
let cor={conectado:'verde',conectando:'amarelo',pendente:'laranja',desconectado:navigator.onLine?'vermelho':'laranja'}[estado]||'amarelo';
conexaoAtual=cor;
const [bola,titulo]=CONEXAO_INFO[cor];
badge.className='conexao '+cor;
$('conexaoBola').textContent=bola;
badge.title='Firebase: '+titulo;
badge.setAttribute('aria-label','Firebase: '+titulo+'. Toque para ver a legenda');
if($('conexaoModal')?.classList.contains('open'))renderLegendaConexao();
}
function renderLegendaConexao(){
$('conexaoLista').innerHTML=Object.entries(CONEXAO_INFO).map(([k,[b,t,d]])=>`<div class="legenda-con${k===conexaoAtual?' atual':''}"><span style="font-size:20px">${b}</span><div><b>${t}${k===conexaoAtual?' · agora':''}</b><span class="small">${d}</span></div></div>`).join('');
}
function atualizarConexaoPorSnapshot(snap){
if(!navigator.onLine){ setConexao('desconectado'); return; }
setConexao(snap.metadata.hasPendingWrites?'pendente':snap.metadata.fromCache?'conectando':'conectado');
}
async function initFirebase(){
if(!firebaseReady){
setCloudStatus('Modo local — Firebase ainda não configurado.');
setConexao('desconectado');
return false;
}
setConexao(navigator.onLine?'conectando':'desconectado');
try{
const appMod=await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
const authMod=await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
const fsMod=await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
firebaseModules={app:appMod,auth:authMod,fs:fsMod};
const app=appMod.initializeApp(FIREBASE_CONFIG);
const auth=authMod.getAuth(app);
firebaseDB=fsMod.getFirestore(app);
firebaseModules.authInstance=auth;
try{
await authMod.setPersistence(auth,authMod.browserLocalPersistence);
}catch(e){
console.warn('Persistência de login:',e);
}
const usuarioRestaurado=await new Promise(resolve=>{
let finalizado=false;
const unsub=authMod.onAuthStateChanged(auth,user=>{
if(finalizado)return;
finalizado=true;
try{unsub();}catch(e){}
resolve(user||null);
});
});
if(usuarioRestaurado){
firebaseUser=usuarioRestaurado;
}else{
await authMod.signInAnonymously(auth);
firebaseUser=auth.currentUser;
}
await registrarUsuario();
await verificarAdministrador();
setCloudStatus(
isAdmin
? '☁️ Firebase conectado — ADMINISTRADOR PRINCIPAL.'
: '☁️ Compartilhamento Firebase conectado.',
'online'
);
const primeiraCarga=await fsMod.getDocs(fsMod.collection(firebaseDB,'remanejamentoRota'));
entries=primeiraCarga.docs.map(d=>({...(d.data()||{}),id:d.id}));
normalizarRegistros();
salvarLocal();
renderEntries();
setConexao(primeiraCarga.metadata?.fromCache ? 'conectando' : 'conectado');
firebaseUnsubscribe=fsMod.onSnapshot(
fsMod.collection(firebaseDB,'remanejamentoRota'),
{includeMetadataChanges:true},
snap=>{
atualizarConexaoPorSnapshot(snap);
if(cloudApplying)return;
if(!snap.docChanges().length)return;
entries=snap.docs.map(d=>({...(d.data()||{}),id:d.id}));
normalizarRegistros();
salvarLocal();
renderEntries();
},
err=>{
console.error('Firebase snapshot',err);
setConexao('desconectado');
setCloudStatus(
'☁️ Firebase conectado, mas aguardando permissão do Firestore.',
'offline'
);
}
);
return true;
}catch(err){
console.error('Falha ao iniciar Firebase',err);
const code=err?.code||'sem-codigo';
const message=err?.message||String(err)||'Erro desconhecido';
setCloudStatus('🔴 Firebase: '+code+' — '+message,'offline');
setConexao('desconectado');
return false;
}
}
async function registrarUsuario(){
if(!firebaseDB || !firebaseModules?.fs || !firebaseUser) return;
try{
const {doc,setDoc,increment}=firebaseModules.fs;
const email=(firebaseUser.email||'').trim().toLowerCase();
await setDoc(doc(firebaseDB,USERS_COLLECTION,firebaseUser.uid),{
uid:firebaseUser.uid,
email:email || null,
anonimo:!email,
ultimoAcessoEm:Date.now(),
acessos:increment(1),
app:'remanejamento-rota'
},{merge:true});
}catch(err){ console.warn('Registro do usuário:',err); }
}
async function verificarAdministrador(unlock=false){
isAdmin=false;
adminEmail=(firebaseUser?.email||'').trim().toLowerCase();
if(!adminEmail || !firebaseDB || !firebaseModules?.fs){
atualizarAdminUI();
return false;
}
try{
if(adminEmail === PRIMARY_ADMIN_EMAIL){
isAdmin = true;
}else{
const {doc,getDoc}=firebaseModules.fs;
const snap=await getDoc(doc(firebaseDB,ADMIN_COLLECTION,adminEmail));
isAdmin=snap.exists();
}
}catch(err){ console.warn('Verificação de administrador:',err); }
if(!unlock) isAdmin=false;
atualizarAdminUI();
return adminEmail === PRIMARY_ADMIN_EMAIL || isAdmin;
}
async function loginAdministrador(){
if(!firebaseModules?.auth || !firebaseModules?.fs || !firebaseModules?.authInstance){
alert('O Firebase ainda está inicializando. Tente novamente.');
return;
}
const savedPin=localStorage.getItem('remanejamento-admin-pin-hash');
const bioReady=await hasBiometricCredential();
$('adminPinInput').value='';
$('adminEmailInput').value=PRIMARY_ADMIN_EMAIL;
$('adminPasswordInput').value='';
$('adminPasswordInput').type='password';
$('adminPasswordEye').textContent='👁️';
$('adminLockMsg').textContent='';
$('adminLockHint').textContent=savedPin
? (bioReady ? 'Use o Face ID ou seu PIN de 4 dígitos.' : 'Digite seu PIN de 4 dígitos. Para usar Face ID, depois de entrar toque em "Ativar Face ID" no painel.')
: 'Primeiro acesso neste aparelho: entre com e-mail e senha para cadastrar o desbloqueio rápido.';
$('adminPinArea').style.display=savedPin?'block':'none';
$('adminPasswordArea').style.display=savedPin?'none':'block';
$('adminPasswordBtn').style.display=savedPin?'block':'none';
$('adminBiometricBtn').style.display=(savedPin && bioReady)?'block':'none';
$('adminPinBtn').style.display=savedPin?'block':'none';
$('adminBackToPinBtn').style.display=savedPin?'block':'none';
$('adminLock').classList.add('open');
if(!savedPin) setTimeout(()=>$('adminEmailInput').focus(),100);
}
function mostrarLoginSenha(){
$('adminPinArea').style.display='none';
$('adminPasswordArea').style.display='block';
$('adminPasswordBtn').style.display='none';
$('adminLockHint').textContent='Entre com e-mail e senha para validar o acesso.';
$('adminLockMsg').textContent='';
setTimeout(()=>$('adminEmailInput').focus(),100);
}
function voltarParaPin(){
const savedPin=localStorage.getItem('remanejamento-admin-pin-hash');
$('adminPasswordArea').style.display='none';
$('adminPinArea').style.display=savedPin?'block':'none';
$('adminPasswordBtn').style.display=savedPin?'block':'none';
$('adminLockHint').textContent=savedPin ? 'Use seu PIN de 4 dígitos ou a biometria deste aparelho.' : 'Primeiro acesso neste aparelho: entre com e-mail e senha para cadastrar o desbloqueio rápido.';
$('adminLockMsg').textContent='';
if(savedPin) setTimeout(()=>$('adminPinInput').focus(),100);
}
function alternarSenha(){
const input=$('adminPasswordInput');
const mostrar=input.type==='password';
input.type=mostrar?'text':'password';
$('adminPasswordEye').textContent='👁️';
$('adminPasswordEye').setAttribute('aria-label',mostrar?'Ocultar senha':'Mostrar senha');
}
async function autenticarComSenha(){
if(!firebaseModules?.authInstance)return;
const email=$('adminEmailInput').value.trim().toLowerCase();
const senha=$('adminPasswordInput').value;
if(!email){ $('adminLockMsg').textContent='Digite o e-mail do administrador.'; return; }
if(!senha){ $('adminLockMsg').textContent='Digite a senha.'; return; }
$('adminLockMsg').textContent='Entrando...';
try{
const auth=firebaseModules.authInstance;
const manterAcesso=$('adminRememberSession')?.checked!==false;
try{
await firebaseModules.auth.setPersistence(
auth,
manterAcesso
? firebaseModules.auth.browserLocalPersistence
: firebaseModules.auth.browserSessionPersistence
);
}catch(e){
console.warn('Não foi possível ajustar a persistência:',e);
}
const cred=await firebaseModules.auth.signInWithEmailAndPassword(auth,email,senha);
firebaseUser=cred.user;
const ok=await verificarAdministrador(true);
if(!ok){ await authModFallbackAnonymous(); throw new Error('Este e-mail ainda não está autorizado como administrador.'); }
localStorage.setItem('remanejamento-admin-last-auth',String(Date.now()));
await configurarDesbloqueioInicial();
$('adminLock').classList.remove('open');
await abrirPainelAdmin();
}catch(err){
console.error(err);
$('adminLockMsg').textContent=err?.message?.includes('não está autorizado')?err.message:'Não foi possível entrar. Verifique o e-mail e a senha.';
}
}
async function desbloquearPorPin(){
const pin=$('adminPinInput').value.trim();
if(!/^\d{4}$/.test(pin)){ $('adminLockMsg').textContent='Digite um PIN de 4 dígitos.'; return; }
const hash=await sha256(pin);
if(hash!==localStorage.getItem('remanejamento-admin-pin-hash')){ $('adminLockMsg').textContent='PIN incorreto.'; return; }
const usuarioAtual=firebaseModules?.authInstance?.currentUser||firebaseUser;
if(usuarioAtual && usuarioAtual!==firebaseUser) firebaseUser=usuarioAtual;
if(!firebaseUser?.email){
$('adminLockMsg').textContent='A sessão administrativa ainda está sendo restaurada. Aguarde um instante e tente novamente.';
return;
}
const ok=await verificarAdministrador(true);
if(!ok){ $('adminLockMsg').textContent='A conta não está autorizada como administrador.'; return; }
localStorage.setItem('remanejamento-admin-unlocked-at',String(Date.now()));
$('adminLock').classList.remove('open');
await abrirPainelAdmin();
}
async function abrirPainelAdmin(){
isAdmin=true; atualizarAdminUI();
atualizarRespostasUI();
$('adminPanel').style.display='block';
atualizarBotaoFaceId();
setCloudStatus('☁️ Administrador conectado.','online');
await renderAdminPanel();
}
async function configurarDesbloqueioInicial(){
if(!localStorage.getItem('remanejamento-admin-pin-hash')){
const pin=prompt('Crie um PIN de 4 dígitos para este aparelho:');
if(pin && /^\d{4}$/.test(pin)) localStorage.setItem('remanejamento-admin-pin-hash',await sha256(pin));
}
if(await canUseWebAuthn() && !await hasBiometricCredential()){
if(confirm('Deseja ativar Face ID / biometria neste aparelho?')) await registrarBiometria();
}
}
async function sha256(text){
const data=new TextEncoder().encode(text); const buf=await crypto.subtle.digest('SHA-256',data);
return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function base64url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64url(str){str=str.replace(/-/g,'+').replace(/_/g,'/'); while(str.length%4)str+='='; return Uint8Array.from(atob(str),c=>c.charCodeAt(0));}
function canUseWebAuthnSync(){return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);}
function temBiometria(){return !!localStorage.getItem('remanejamento-admin-webauthn-id');}
async function canUseWebAuthn(){return canUseWebAuthnSync();}
async function hasBiometricCredential(){return temBiometria();}
function registrarBiometria(){
if(!canUseWebAuthnSync())return Promise.resolve(false);
let pedido;
try{
const challenge=crypto.getRandomValues(new Uint8Array(32));
const userId=crypto.getRandomValues(new Uint8Array(16));
pedido=navigator.credentials.create({publicKey:{challenge,rp:{name:'Remanejamento de Rota',id:location.hostname},user:{id:userId,name:PRIMARY_ADMIN_EMAIL,displayName:'Desenvolvedor'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},timeout:60000}});
}catch(err){console.warn('Biometria não configurada:',err);return Promise.resolve(false);}
return pedido.then(cred=>{
if(!cred)return false;
localStorage.setItem('remanejamento-admin-webauthn-id',base64url(cred.rawId));
return true;
}).catch(err=>{console.warn('Biometria não configurada:',err);return false;});
}
function desbloquearPorBiometria(){
if(!canUseWebAuthnSync() || !temBiometria()){
$('adminLockMsg').textContent='Face ID ainda não foi ativado neste aparelho.';
return Promise.resolve(false);
}
let pedido;
try{
const challenge=crypto.getRandomValues(new Uint8Array(32));
const rawId=fromBase64url(localStorage.getItem('remanejamento-admin-webauthn-id'));
pedido=navigator.credentials.get({publicKey:{challenge,allowCredentials:[{type:'public-key',id:rawId}],userVerification:'required',timeout:60000}});
}catch(err){
console.warn(err);
$('adminLockMsg').textContent='Não foi possível abrir o Face ID. Use o PIN.';
return Promise.resolve(false);
}
return pedido.then(async cred=>{
if(!cred)throw new Error('Biometria não confirmada.');
const usuarioAtual=firebaseModules?.authInstance?.currentUser||firebaseUser;
if(usuarioAtual && usuarioAtual!==firebaseUser) firebaseUser=usuarioAtual;
if(!firebaseUser?.email)throw new Error('A sessão administrativa não foi restaurada.');
const ok=await verificarAdministrador(true);
if(!ok)throw new Error('A conta não está autorizada como administrador.');
localStorage.setItem('remanejamento-admin-unlocked-at',String(Date.now()));
$('adminLock').classList.remove('open');
await abrirPainelAdmin();
return true;
}).catch(err=>{
console.warn(err);
$('adminLockMsg').textContent='Não foi possível confirmar o Face ID. Use o PIN ou e-mail + senha.';
return false;
});
}
function atualizarBotaoFaceId(){
const b=$('faceIdBtn'); if(!b)return;
b.textContent=temBiometria()?'✅ Face ID ativado (refazer)':'🙂 Ativar Face ID neste aparelho';
}
async function authModFallbackAnonymous(){
const auth=firebaseModules.authInstance;
await firebaseModules.auth.signOut(auth);
await firebaseModules.auth.signInAnonymously(auth);
firebaseUser=auth.currentUser;
isAdmin=false;
adminEmail='';
await registrarUsuario();
atualizarAdminUI();
}
async function sairAdministrador(){
lockAdminArea();
setCloudStatus(
firebaseUser?.email
? '☁️ Sessão do administrador mantida neste aparelho.'
: '☁️ Compartilhamento Firebase conectado.',
'online'
);
}
function atualizarAdminUI(){
const btn=$('adminBtn');
if(btn){
btn.textContent=isAdmin?'⚙️':'🔐';
btn.title=isAdmin?'Administração (liberada)':'Administração';
btn.style.display='inline-flex';
}
}
async function adicionarAdministrador(){
if(!isAdmin || adminEmail !== PRIMARY_ADMIN_EMAIL){
alert('Somente o Desenvolvedor principal pode adicionar administradores.');
return;
}
const email=prompt('Digite o e-mail que será autorizado como administrador:');
if(!email)return;
const normalizado=email.trim().toLowerCase();
if(!/^\S+@\S+\.\S+$/.test(normalizado)){
alert('Digite um e-mail válido.');
return;
}
if(normalizado===PRIMARY_ADMIN_EMAIL){
alert('Esse e-mail já é o Desenvolvedor principal.');
return;
}
try{
const {doc,setDoc}=firebaseModules.fs;
await setDoc(doc(firebaseDB,ADMIN_COLLECTION,normalizado),{
email:normalizado,
adicionadoPor:PRIMARY_ADMIN_EMAIL,
adicionadoEm:Date.now(),
ativo:true
},{merge:true});
alert('Administrador autorizado com sucesso.\n\nImportante: esse e-mail também precisa existir no Firebase Authentication com acesso por e-mail e senha para a pessoa conseguir entrar.');
await renderAdminPanel();
}catch(err){
console.error(err);
alert('Não foi possível adicionar o administrador: '+(err?.message||err));
}
}
async function removerAdministrador(email){
if(!isAdmin || adminEmail !== PRIMARY_ADMIN_EMAIL)return;
const normalizado=String(email||'').trim().toLowerCase();
if(!normalizado || normalizado===PRIMARY_ADMIN_EMAIL)return;
if(!confirm(`Remover ${normalizado} da lista de administradores?`))return;
try{
const {deleteDoc,doc}=firebaseModules.fs;
await deleteDoc(doc(firebaseDB,ADMIN_COLLECTION,normalizado));
await renderAdminPanel();
}catch(err){
console.error(err);
alert('Não foi possível remover: '+(err?.message||err));
}
}
async function renderAdminPanel(){
if(!isAdmin || !firebaseDB || !firebaseModules?.fs)return;
const box=$('adminSummary');
const list=$('adminRecords');
const adminList=$('adminList');
if(box)box.textContent='Carregando...';
try{
const {collection,getDocs}=firebaseModules.fs;
const snap=await getDocs(collection(firebaseDB,'remanejamentoRota'));
const docs=snap.docs.map(d=>({id:d.id,...(d.data()||{})})).filter(Boolean);
const usersSnap=await getDocs(collection(firebaseDB,USERS_COLLECTION));
let admins=[];
if(adminEmail===PRIMARY_ADMIN_EMAIL){
const adminsSnap=await getDocs(collection(firebaseDB,ADMIN_COLLECTION));
admins=adminsSnap.docs.map(d=>d.data()).filter(Boolean).sort((a,b)=>String(a.email||'').localeCompare(String(b.email||'')));
}
const userDocs=usersSnap.docs.map(d=>d.data()||{});
const cadastrados=userDocs.filter(u=>String(u.email||'').trim()).length;
const ativos24h=userDocs.filter(u=>{
const email=String(u.email||'').trim();
const t=Number(u.ultimoAcessoEm||0);
return !!email && t && Date.now()-t<=24*60*60*1000;
}).length;
const acessosTotais=userDocs.reduce((n,u)=>n+Number(u.acessos||0),0);
if(box)box.innerHTML=`<div class="admin-counters"><div class="admin-counter"><strong>${cadastrados}</strong><span>USUÁRIOS CADASTRADOS</span></div><div class="admin-counter"><strong>${ativos24h}</strong><span>ATIVOS (24H)</span></div><div class="admin-counter"><strong>${admins.length+1}</strong><span>ADMINISTRADORES</span></div><div class="admin-counter"><strong>${acessosTotais}</strong><span>ACESSOS TOTAIS</span></div><div class="admin-counter"><strong>${docs.length}</strong><span>LANÇAMENTOS</span></div><div class="admin-counter"><strong>${docs.reduce((n,e)=>n+(e.medidores||[]).length,0)}</strong><span>MEDIDORES / UCs</span></div></div>`;
if(adminList){
adminList.innerHTML=`<div style="margin:10px 0 4px;font-weight:700">👥 Administradores autorizados</div>
<div class="admin-record" style="border-color:var(--accent)">
<div><b>👑 ${escapeHtml(PRIMARY_ADMIN_EMAIL)}</b></div>
<div class="small">Desenvolvedor principal · acesso total</div>
</div>`+
(admins.length ? admins.map(a=>`<div class="admin-record">
<div><b>⚙️ ${escapeHtml(a.email||'')}</b></div>
<div class="small">Administrador autorizado</div>
<button type="button" data-admin-remove="${escapeHtml(a.email||'')}">🗑️ Remover administrador</button>
</div>`).join('') : '<div class="empty">Nenhum administrador adicional.</div>');
adminList.querySelectorAll('[data-admin-remove]').forEach(btn=>{
btn.addEventListener('click',()=>removerAdministrador(btn.dataset.adminRemove));
});
}
if(!list)return;
if(!docs.length){list.innerHTML='<div class="empty">Nenhum registro no Firebase.</div>';return;}
const semEtapaDocs=docs.filter(e=>!String(e.rotaDestino||'').trim());
const ordenados=docs.sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
list.innerHTML=`
${semEtapaDocs.length ? `
<div class="admin-record" style="border-color:var(--red);display:flex;align-items:center;justify-content:space-between;gap:10px">
<div><b>Sem etapa</b><div class="small">${semEtapaDocs.length} lançamento${semEtapaDocs.length===1?'':'s'} sem etapa</div></div>
<button type="button" data-admin-delete-sem-etapa="1" style="white-space:nowrap">🗑️ Excluir todos</button>
</div>` : ''}
${ordenados.map(e=>`
<div class="admin-record">
<div><b>${escapeHtml((e.medidores||[]).map(m=>m.numero).join(' · ')||'Sem medidor/UC')}</b></div>
<div class="small">${escapeHtml(e.rotaDestino?`Etapa ${e.rotaDestino}`:'Sem etapa')} · ${escapeHtml(e.dataRegistro||'')}${e.solicitadoPor?' · 👤 '+escapeHtml(e.solicitadoPor):''}</div>
<button type="button" data-admin-delete="${escapeHtml(e.id)}">🗑️ Excluir registro inteiro</button>
</div>
`).join('')}
`;
const bulkBtn=list.querySelector('[data-admin-delete-sem-etapa]');
if(bulkBtn){
bulkBtn.addEventListener('click',async()=>{
if(!isAdmin || adminEmail!==PRIMARY_ADMIN_EMAIL)return;
const total=semEtapaDocs.length;
if(!confirm(`Excluir os ${total} lançamentos sem etapa? Os lançamentos que possuem etapa serão mantidos.`))return;
try{
const {deleteDoc,doc}=firebaseModules.fs;
for(const e of semEtapaDocs){ await deleteDoc(doc(firebaseDB,'remanejamentoRota',e.id)); }
const ids=new Set(semEtapaDocs.map(e=>e.id));
entries=entries.filter(e=>!ids.has(e.id));
salvarLocal();
renderEntries();
await renderAdminPanel();
alert(`${total} lançamento${total===1?'':'s'} sem etapa excluído${total===1?'':'s'}. Os lançamentos com etapa foram mantidos.`);
}catch(err){
console.error(err);
alert('Não foi possível concluir a exclusão em massa: '+(err?.message||err));
}
});
}
list.querySelectorAll('[data-admin-delete]').forEach(btn=>{
btn.addEventListener('click',async()=>{
if(!confirm('Excluir este registro inteiro do Firebase? Esta ação é administrativa e não é a mesma coisa que apagar uma marcação.'))return;
try{
await firebaseModules.fs.deleteDoc(firebaseModules.fs.doc(firebaseDB,'remanejamentoRota',btn.dataset.adminDelete));
entries=entries.filter(e=>e.id!==btn.dataset.adminDelete);
if(editandoId===btn.dataset.adminDelete)cancelarEdicao();
salvarLocal();
renderEntries();
await renderAdminPanel();
}catch(err){alert('Não foi possível excluir: '+(err?.message||err));}
});
});
}catch(err){
if(box)box.textContent='Não foi possível carregar a administração: '+(err?.message||err);
}
}
async function salvarCloud(entry){
if(!firebaseDB || !firebaseModules || !firebaseUser || !entry)return false;
try{
cloudApplying=true;
const {doc,setDoc}=firebaseModules.fs;
await setDoc(doc(firebaseDB,'remanejamentoRota',entry.id),entry,{merge:true});
return true;
}catch(err){
console.error('Falha ao salvar no Firebase',err);
setCloudStatus('☁️ Falha ao salvar no Firebase.','offline');
setConexao('pendente');
return false;
}finally{
cloudApplying=false;
}
}
async function excluirCloud(entryId){
if(!firebaseDB || !firebaseModules || !firebaseUser)return false;
const id=String(entryId||'').trim();
if(!id)return false;
try{
cloudApplying=true;
await firebaseModules.fs.deleteDoc(firebaseModules.fs.doc(firebaseDB,'remanejamentoRota',id));
return true;
}catch(err){
console.error('Falha ao excluir no Firebase',err);
return false;
}finally{
cloudApplying=false;
}
}
const CHAVE_DADOS = 'remanejamento-rota-entries';
let entries = [];
let filtroAtual = '';
let filtroEtapa = '';
let medidorValores = [''];
let selectedFotos = [];
let dataRegistro = todayStr();
let modalFotos = [];
let modalIndex = 0;
let editandoId = null;
let tipoRem = 'cliente';
const $ = id => document.getElementById(id);
function formatDateHora(timestamp){
if(!timestamp) return '';
const d = new Date(timestamp);
return d.toLocaleDateString('pt-BR') + ' ' +
d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function todayStr(){
const d = new Date();
return d.getFullYear() + '-' +
String(d.getMonth()+1).padStart(2,'0') + '-' +
String(d.getDate()).padStart(2,'0');
}
function escapeHtml(value){
return String(value ?? '').replace(/[&<>"']/g, ch => ({
'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[ch]));
}
const CHAVE_MEU_NOME='remanejamento-meu-nome';
const CHAVE_RESP_LIDAS='remanejamento-respostas-lidas';
const STATUS_RESPOSTA=['espelho','nao-realizado','concluido','recusado'];
function normNome(s){
return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function meuNome(){ try{ return localStorage.getItem(CHAVE_MEU_NOME)||''; }catch(e){ return ''; } }
function atualizarObrigMedidor(){
const opcional=tipoRem!=='cliente';
$('medidorObrig').style.display=opcional?'none':'inline';
$('medidorOpc').style.display=opcional?'inline':'none';
$('medidorOpc').textContent=tipoRem==='parte-livro'?'(opcional — por sequência)':'(opcional — livro todo)';
}
function definirTipo(tipo){
tipoRem=(tipo==='livro-todo'||tipo==='parte-livro')?tipo:'cliente';
$('tipoOpts').querySelectorAll('[data-tipo]').forEach(b=>b.classList.toggle('ativo',b.dataset.tipo===tipoRem));
$('seqArea').style.display=tipoRem==='parte-livro'?'block':'none';
$('livroObrig').style.display=tipoRem==='cliente'?'none':'inline';
atualizarObrigMedidor();
}
$('tipoOpts').querySelectorAll('[data-tipo]').forEach(b=>{
b.addEventListener('click',()=>{
definirTipo(b.dataset.tipo);
if(tipoRem==='parte-livro' && !$('seqInicio').value) setTimeout(()=>$('seqInicio').focus(),100);
});
});
['seqInicio','seqFim'].forEach(id=>{
$(id).addEventListener('input',e=>{
const limpo=e.target.value.replace(/\D/g,'');
if(e.target.value!==limpo)e.target.value=limpo;
});
});
function textoItemLivro(livro,parte,seqInicio,seqFim){
return parte ? `Livro ${livro} — da seq. ${seqInicio} até a seq. ${seqFim}` : `Livro ${livro} — todo`;
}
function textoTipo(e){
return e.parteLivro?'Por sequência':e.livroTodo?'Livro todo':'Cliente';
}
function itemLivro(livro,parte=false,seqInicio='',seqFim=''){
return {
id:'m'+Date.now().toString(36)+'L'+Math.random().toString(36).slice(2,5),
numero:textoItemLivro(livro,parte,seqInicio,seqFim),
livro:true,
status:'pendente',statusEm:null,transferidoPara:null,origemId:null,origemData:null
};
}
function ehMinha(e){
const uid=firebaseUser?.uid;
if(uid && e.solicitanteUid===uid)return true;
const n=normNome(meuNome());
return !!n && normNome(e.solicitadoPor)===n;
}
function lerLidas(){
try{ return JSON.parse(localStorage.getItem(CHAVE_RESP_LIDAS)||'{}')||{}; }catch(e){ return {}; }
}
function coletarRespostas(){
const lidas=lerLidas();
const uid=firebaseUser?.uid||null;
const lista=[];
entries.forEach(e=>{
if(!ehMinha(e))return;
(e.medidores||[]).forEach(m=>{
if(!STATUS_RESPOSTA.includes(m.status) || !m.statusEm)return;
if(uid && m.respondidoPor===uid)return; // marcação feita por mim mesmo
const chave=e.id+':'+m.id;
lista.push({entry:e,m,chave,nova:Number(lidas[chave]||0)<Number(m.statusEm)});
});
});
return lista.sort((a,b)=>Number(b.m.statusEm)-Number(a.m.statusEm));
}
function renderRespostas(lista=coletarRespostas()){
const icone={'espelho':'🔵','nao-realizado':'🔴','concluido':'🟢','recusado':'⛔'};
$('respostasLista').innerHTML=lista.length ? lista.map(r=>`
<div class="resp-item${r.nova?' nova':''}">
<div><b>${icone[r.m.status]||''} ${escapeHtml(statusLabel(r.m.status))}</b>${r.nova?' · <span class="resp-nova-tag">nova</span>':''}</div>
<div>Medidor / UC <b>${escapeHtml(r.m.numero)}</b></div>
${r.m.status==='recusado'&&r.m.motivoRecusa?`<div class="recusa-info">Motivo: ${escapeHtml(r.m.motivoRecusa)}</div>`:''}
<div class="small">${escapeHtml(etapaLabel(r.entry.rotaDestino))}${r.entry.rua?' · '+escapeHtml(r.entry.rua):''} · ${formatDateHora(r.m.statusEm)}</div>
${r.m.transferidoPara?`<div class="small">↪ Transferido para ${formatDateBR(r.m.transferidoPara)}</div>`:''}
</div>`).join('') : '<div class="empty">Nenhuma resposta ainda.</div>';
}
// Desenvolvedor/administrador (conta com e-mail neste aparelho) não recebe o 🔔:
// ele é quem marca os medidores. O aviso é só para quem lança.
function souDesenvolvedor(){
if(firebaseUser){
const dev=!!firebaseUser.email;
try{ dev?localStorage.setItem('remanejamento-sou-dev','1'):localStorage.removeItem('remanejamento-sou-dev'); }catch(e){}
return dev;
}
try{ return localStorage.getItem('remanejamento-sou-dev')==='1'; }catch(e){ return false; }
}
function atualizarRespostasUI(){
const btn=$('respostasBtn'); if(!btn)return;
if(souDesenvolvedor()){
btn.style.display='none';
$('respostasBanner').style.display='none';
$('respostasModal').classList.remove('open');
return;
}
const lista=coletarRespostas();
const novas=lista.filter(r=>r.nova).length;
btn.style.display=entries.some(ehMinha)?'inline-flex':'none';
const badge=$('respostasBadge');
badge.textContent=novas>9?'9+':String(novas);
badge.style.display=novas?'block':'none';
const banner=$('respostasBanner');
if(novas){
banner.textContent=`🔔 ${novas} resposta${novas===1?' nova':'s novas'} das suas solicitações — toque para ver`;
banner.style.display='block';
}else{
banner.style.display='none';
}
if($('respostasModal').classList.contains('open'))renderRespostas(lista);
}
function abrirRespostas(){
if(souDesenvolvedor())return;
renderRespostas();
$('respostasModal').classList.add('open');
}
function marcarRespostasVistas(){
const lidas=lerLidas();
coletarRespostas().forEach(r=>{ lidas[r.chave]=r.m.statusEm; });
try{ localStorage.setItem(CHAVE_RESP_LIDAS,JSON.stringify(lidas)); }catch(e){}
atualizarRespostasUI();
}
$('respostasBtn').addEventListener('click',abrirRespostas);
$('respostasBanner').addEventListener('click',abrirRespostas);
$('respostasLidasBtn').addEventListener('click',()=>{ marcarRespostasVistas(); $('respostasModal').classList.remove('open'); });
$('respostasFecharBtn').addEventListener('click',()=>$('respostasModal').classList.remove('open'));
$('respostasModal').addEventListener('click',e=>{ if(e.target.id==='respostasModal')$('respostasModal').classList.remove('open'); });
$('solicitadoPor').value=meuNome();
$('versaoApp').textContent=`Versão ${APP_VERSAO} · ${APP_VERSAO_DATA}`;
let recusaAlvo=null;
function abrirRecusa(entryId,mid){
const entry=entries.find(e=>e.id===entryId);
const m=entry?.medidores.find(x=>x.id===mid);
if(!entry||!m)return;
recusaAlvo={entryId,mid};
$('recusaInfo').textContent=`Medidor / UC ${m.numero} · ${etapaLabel(entry.rotaDestino)}${entry.solicitadoPor?' · pedido por '+entry.solicitadoPor:''}`;
$('recusaMotivo').value=m.status==='recusado'?(m.motivoRecusa||''):'';
$('recusaMotivos').querySelectorAll('button').forEach(b=>b.classList.toggle('ativo',!!b.dataset.motivo && b.dataset.motivo===$('recusaMotivo').value));
$('recusaMsg').textContent='';
$('recusaModal').classList.add('open');
}
function fecharRecusa(){
recusaAlvo=null;
$('recusaModal').classList.remove('open');
}
async function confirmarRecusa(){
const motivo=$('recusaMotivo').value.trim();
if(!motivo){ $('recusaMsg').textContent='Escolha ou escreva o motivo da recusa.'; return; }
const entry=entries.find(e=>e.id===recusaAlvo?.entryId);
const m=entry?.medidores.find(x=>x.id===recusaAlvo?.mid);
if(!entry||!m){ fecharRecusa(); return; }
m.status='recusado';
m.motivoRecusa=motivo;
m.statusEm=Date.now();
m.respondidoPor=firebaseUser?.uid||null;
fecharRecusa();
salvarLocal();
await salvarCloud(entry);
renderEntries();
}
$('recusaMotivos').querySelectorAll('button').forEach(b=>{
b.addEventListener('click',()=>{
$('recusaMotivos').querySelectorAll('button').forEach(x=>x.classList.remove('ativo'));
b.classList.add('ativo');
$('recusaMotivo').value=b.dataset.motivo;
$('recusaMsg').textContent='';
if(!b.dataset.motivo)$('recusaMotivo').focus();
});
});
$('recusaConfirmarBtn').addEventListener('click',confirmarRecusa);
$('recusaCancelarBtn').addEventListener('click',fecharRecusa);
$('recusaModal').addEventListener('click',e=>{ if(e.target.id==='recusaModal')fecharRecusa(); });
function renderMedidorRows(){
$('medidorList').innerHTML = medidorValores.map((val,i)=>`
<div class="medidor-row">
<span class="medidor-status" title="Status do medidor"></span>
<input type="text" inputmode="text" placeholder="Ex: 987654 ou UC 123456" class="medidor-input" data-i="${i}" value="${escapeHtml(val)}">
${`<button type="button" class="rm-medidor" data-i="${i}" title="Excluir somente este número (correção)">🗑️</button>`}
</div>
`).join('');
$('medidorList').querySelectorAll('.medidor-input').forEach(inp=>{
inp.addEventListener('input',()=>{ medidorValores[Number(inp.dataset.i)] = inp.value; });
});
$('medidorList').querySelectorAll('.rm-medidor').forEach(btn=>{
btn.addEventListener('click',()=>{
const i=Number(btn.dataset.i);
if(!medidorValores[i]) return;
medidorValores.splice(i,1);
if(!medidorValores.length) medidorValores=[''];
renderMedidorRows();
});
});
}
$('addMedidorBtn').addEventListener('click',()=>{
medidorValores.push('');
renderMedidorRows();
});
renderMedidorRows();
$('dataRegistro').value=todayStr();
$('dataRegistro').addEventListener('change',e=>{ dataRegistro=e.target.value||todayStr(); });
$('etapaSelect').innerHTML='<option value="">Escolha a etapa</option>'+
Array.from({length:18},(_,i)=>i+1).map(n=>`<option value="${n}">Etapa ${n}</option>`).join('');
function definirEtapa(valor){
const v=String(valor||'');
$('etapaSelect').value=v;
$('rotaDestino').value=v;
$('etapaSelect').classList.toggle('escolhida',!!v);
}
$('etapaSelect').addEventListener('change',()=>{
definirEtapa($('etapaSelect').value);
if(editandoId) $('editBanner').textContent=$('etapaSelect').value?`✏️ Editando lançamento — Etapa ${$('etapaSelect').value}`:'✏️ Editando lançamento';
});
function compressImage(file){
return new Promise((resolve,reject)=>{
const reader = new FileReader();
reader.onload=e=>{
const img=new Image();
img.onload=()=>{
const maxW=900;
let w=img.width,h=img.height;
if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
const canvas=document.createElement('canvas');
canvas.width=w;canvas.height=h;
const ctx=canvas.getContext('2d');
ctx.drawImage(img,0,0,w,h);
resolve(canvas.toDataURL('image/jpeg',.6));
};
img.onerror=()=>reject(new Error('Falha ao carregar imagem'));
img.src=e.target.result;
};
reader.onerror=()=>reject(new Error('Falha ao ler arquivo'));
reader.readAsDataURL(file);
});
}
function renderFotoPreview(){
$('fotoPreview').innerHTML = selectedFotos.map((foto,i)=>`
<div class="foto-thumb">
<img src="${foto}" alt="Foto ${i+1}">
<button class="rm" data-i="${i}" type="button">×</button>
</div>
`).join('');
$('fotoPreview').querySelectorAll('.rm').forEach(btn=>{
btn.addEventListener('click',()=>{
selectedFotos.splice(Number(btn.dataset.i),1);
renderFotoPreview();
});
});
}
async function adicionarFotos(files){
for(const file of Array.from(files||[])){
try{ selectedFotos.push(await compressImage(file)); }
catch(err){ console.error(err); }
}
renderFotoPreview();
}
$('fotoCameraBtn').addEventListener('click',()=>$('fotoCameraInput').click());
$('fotoGaleriaBtn').addEventListener('click',()=>$('fotoGaleriaInput').click());
$('fotoCameraInput').addEventListener('change',async e=>{ await adicionarFotos(e.target.files); e.target.value=''; });
$('fotoGaleriaInput').addEventListener('change',async e=>{ await adicionarFotos(e.target.files); e.target.value=''; });
function abrirModalFoto(fotos,index){
modalFotos=fotos||[];
modalIndex=index;
atualizarModal();
$('fotoModal').classList.add('open');
}
function atualizarModal(){
if(!modalFotos.length)return;
$('fotoModalImg').src=modalFotos[modalIndex];
$('fotoModalNav').style.display=modalFotos.length>1?'flex':'none';
}
$('fotoModalClose').addEventListener('click',()=>$('fotoModal').classList.remove('open'));
$('fotoModal').addEventListener('click',e=>{
if(e.target.id==='fotoModal')$('fotoModal').classList.remove('open');
});
$('fotoModalPrev').addEventListener('click',()=>{
modalIndex=(modalIndex-1+modalFotos.length)%modalFotos.length;
atualizarModal();
});
$('fotoModalNext').addEventListener('click',()=>{
modalIndex=(modalIndex+1)%modalFotos.length;
atualizarModal();
});
function limparFormulario(){
medidorValores=['']; renderMedidorRows();
$('solicitadoPor').value=meuNome();
dataRegistro=todayStr();
$('dataRegistro').value=dataRegistro;
$('vizinha').value='';
$('livro').value='';
$('seqInicio').value='';
$('seqFim').value='';
definirTipo('cliente');
$('rua').value='';
$('obs').value='';
selectedFotos=[]; renderFotoPreview();
}
function atualizarModoEdicaoUI(){
const editando=!!editandoId;
$('editBanner').style.display=editando?'block':'none';
$('cancelEditBtn').style.display=editando?'block':'none';
$('saveBtn').textContent=editando?'💾 Salvar alterações':'💾 Salvar registro';
}
function iniciarEdicao(id){
const entry=entries.find(e=>e.id===id);
if(!entry)return;
editandoId=id;
medidorValores=(entry.medidores||[]).filter(m=>!m.livro).map(m=>m.numero);
medidorValores.push('');
renderMedidorRows();
dataRegistro=entry.dataRegistro||todayStr();
$('dataRegistro').value=dataRegistro;
$('solicitadoPor').value=entry.solicitadoPor||'';
$('vizinha').value=entry.vizinha||'';
$('livro').value=entry.livro||'';
$('seqInicio').value=entry.seqInicio||'';
$('seqFim').value=entry.seqFim||'';
definirTipo(entry.parteLivro?'parte-livro':entry.livroTodo?'livro-todo':'cliente');
$('rua').value=entry.rua||'';
$('obs').value=entry.obs||'';
selectedFotos=[...(entry.fotos||[])];
renderFotoPreview();
const etapa=etapaValorNormalizado(entry.rotaDestino);
definirEtapa(etapa);
$('editBanner').textContent=etapa?`✏️ Editando lançamento — Etapa ${etapa}`:'✏️ Editando lançamento';
atualizarModoEdicaoUI();
$('statusMsg').textContent='';
renderEntries();
$('formCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelarEdicao(){
editandoId=null;
limparFormulario();
atualizarModoEdicaoUI();
renderEntries();
}
async function salvarEdicao(dados){
const status=$('statusMsg');
const btn=$('saveBtn');
const entry=entries.find(e=>e.id===editandoId);
if(!entry){
cancelarEdicao();
status.textContent='Este lançamento não existe mais.';
status.style.color='var(--red)';
return;
}
const antigos=[...(entry.medidores||[])];
const novosMedidores=dados.medidores.map((numero,i)=>{
const idx=antigos.findIndex(m=>!m.livro && m.numero===numero);
if(idx>=0) return antigos.splice(idx,1)[0];
return {
id:'m'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,4),
numero,status:'pendente',statusEm:null,transferidoPara:null,origemId:null,origemData:null
};
});
if(dados.livroTodo || dados.parteLivro){
const texto=textoItemLivro(dados.livro,dados.parteLivro,dados.seqInicio,dados.seqFim);
const idxLivro=antigos.findIndex(m=>m.livro);
if(idxLivro>=0){
const it=antigos.splice(idxLivro,1)[0];
it.numero=texto;
novosMedidores.push(it);
}else{
novosMedidores.push(itemLivro(dados.livro,dados.parteLivro,dados.seqInicio,dados.seqFim));
}
}
const copia=JSON.parse(JSON.stringify(entry));
Object.assign(entry,{
medidores:novosMedidores,
solicitadoPor:dados.solicitadoPor,
livroTodo:!!dados.livroTodo,
parteLivro:!!dados.parteLivro,
seqInicio:dados.parteLivro?dados.seqInicio:'',
seqFim:dados.parteLivro?dados.seqFim:'',
dataRegistro:dados.data,
vizinha:dados.vizinha,
livro:dados.livro,
rotaDestino:dados.rotaDestino,
rua:dados.rua,
obs:dados.obs,
fotos:[...selectedFotos],
editadoEm:Date.now()
});
btn.disabled=true;
status.textContent='Salvando alterações...';
status.style.color='var(--text-dim)';
if(!salvarLocal()){
Object.assign(entry,copia);
btn.disabled=false;
status.textContent='Não foi possível salvar. Verifique o armazenamento do navegador.';
status.style.color='var(--red)';
return;
}
const okCloud=firebaseDB ? await salvarCloud(entry) : true;
editandoId=null;
limparFormulario();
atualizarModoEdicaoUI();
renderEntries();
btn.disabled=false;
if(okCloud){
status.textContent='Alterações salvas.';
status.style.color='var(--accent)';
}else{
status.textContent='Alterações salvas no aparelho, mas não no Firebase.';
status.style.color='var(--red)';
}
setTimeout(()=>status.textContent='',2500);
}
$('cancelEditBtn').addEventListener('click',cancelarEdicao);
function lerDados(){
try{
const raw=localStorage.getItem(CHAVE_DADOS);
if(!raw)return [];
const dados=JSON.parse(raw);
return Array.isArray(dados)?dados:[];
}catch(e){
console.error('Erro ao ler registros',e);
return [];
}
}
function salvarLocal(){
try{
localStorage.setItem(CHAVE_DADOS,JSON.stringify(entries));
return true;
}catch(e){
console.error('Erro ao salvar registros',e);
return false;
}
}
function normalizarMedidores(e){
const lista=Array.isArray(e.medidores)?e.medidores:(e.medidor?[e.medidor]:[]);
return lista.map((m,idx)=>{
if(typeof m==='string'){
return {
id:(e.id||'m')+'-'+idx,
numero:m,
status:'pendente',
statusEm:null,
transferidoPara:null,
origemId:null,
origemData:null
};
}
return {
id:m.id||((e.id||'m')+'-'+idx),
numero:String(m.numero??m.medidor??''),
status:m.status||'pendente',
statusEm:m.statusEm||null,
transferidoPara:m.transferidoPara||null,
origemId:m.origemId||null,
origemData:m.origemData||null,
respondidoPor:m.respondidoPor||null,
motivoRecusa:m.motivoRecusa||null,
livro:!!m.livro
};
}).filter(m=>m.numero);
}
function normalizarRegistros(){
entries=entries.map(e=>({
...e,
id:e.id || (Date.now().toString(36)+Math.random().toString(36).slice(2,7)),
medidores:normalizarMedidores(e),
dataRegistro:e.dataRegistro || new Date(e.criadoEm||Date.now()).toISOString().slice(0,10),
livro:String(e.livro||''),
parteLivro:!!e.parteLivro,
seqInicio:String(e.seqInicio||''),
seqFim:String(e.seqFim||''),
fotos:Array.isArray(e.fotos)?e.fotos:[],
digitado:Boolean(e.digitado),
digitadoEm:e.digitadoEm||null,
criadoEm:e.criadoEm||Date.now()
}));
}
function formatDateBR(iso){
if(!iso)return '';
const p=iso.split('-');
return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso;
}
function statusLabel(status){
return status==='espelho'?'Espelho':status==='nao-realizado'?'Não realizado':status==='concluido'?'Concluído':status==='recusado'?'Recusado':'Pendente';
}
function statusClass(status){
return status==='espelho'?'espelho':status==='nao-realizado'?'nao-realizado':status==='concluido'?'concluido':status==='recusado'?'recusado':'';
}
function proximoMes(iso){
const d=new Date((iso||todayStr())+'T12:00:00');
d.setMonth(d.getMonth()+1);
return d.toISOString().slice(0,10);
}
function setMedidorStatus(entryId,medidorId,status){
const entry=entries.find(e=>e.id===entryId);
const m=entry?.medidores.find(x=>x.id===medidorId);
if(!m)return;
m.status=status;
m.statusEm=Date.now();
m.respondidoPor=firebaseUser?.uid||null;
if(status!=='recusado')m.motivoRecusa=null;
salvarLocal();
salvarCloud(entry);
renderEntries();
}
function transferirMedidor(entryId,medidorId){
const entry=entries.find(e=>e.id===entryId);
const m=entry?.medidores.find(x=>x.id===medidorId);
if(!entry||!m)return;
if(m.status==='concluido' || m.status==='recusado')return;
const destino=proximoMes(entry.dataRegistro);
m.transferidoPara=destino;
if(m.status==='pendente')m.status='nao-realizado';
m.statusEm=Date.now();
m.respondidoPor=firebaseUser?.uid||null;
const ehParte=!!m.livro && !!entry.parteLivro;
const novo={
id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),
medidores:[{
id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
numero:m.numero,
livro:!!m.livro,
status:'pendente',
statusEm:null,
transferidoPara:null,
origemId:entry.id,
origemData:entry.dataRegistro
}],
solicitadoPor:entry.solicitadoPor||'',
solicitanteUid:entry.solicitanteUid||null,
vizinha:entry.vizinha||'',
livro:entry.livro||'',
livroTodo:!!m.livro && !ehParte,
parteLivro:ehParte,
seqInicio:ehParte?(entry.seqInicio||''):'',
seqFim:ehParte?(entry.seqFim||''):'',
rotaDestino:entry.rotaDestino||'',
rua:entry.rua||'',
obs:entry.obs||'',
fotos:[],
digitado:false,digitadoEm:null,
dataRegistro:destino,
criadoEm:Date.now()
};
entries.push(novo);
salvarLocal();
salvarCloud(entry);
salvarCloud(novo);
renderEntries();
}
function historicoMedidor(numero){
return entries
.filter(e=>e.medidores.some(m=>m.numero===numero))
.sort((a,b)=>(a.dataRegistro||'').localeCompare(b.dataRegistro||''));
}
function etapaNumero(valor){
const m=String(valor??'').match(/\d+/);
return m?Number(m[0]):999;
}
function etapaLabel(valor){
const v=String(valor??'').trim();
return v ? (v.match(/^\d+$/)?`Etapa ${v}`:v) : 'Etapa sem identificação';
}
function etapaBuscaExata(termo){
const t=String(termo||'').trim().toLowerCase().replace(/^etapa\s*/,'');
if(!/^\d{1,2}$/.test(t))return null;
const n=Number(t);
return n>=1&&n<=18?n:null;
}
function etapaValorNormalizado(valor){
const m=String(valor??'').trim().match(/^(?:etapa\s*)?(\d{1,2})$/i);
return m?String(Number(m[1])):'';
}
function entryMatchesSearch(e,termo){
if(!termo)return true;
const etapaExata=etapaBuscaExata(termo);
if(etapaExata!==null)return etapaValorNormalizado(e.rotaDestino)===String(etapaExata);
const base=[e.rotaDestino,e.rua,e.vizinha,e.livro,e.dataRegistro,e.obs,e.solicitadoPor,e.livroTodo?'livro todo':'',e.parteLivro?`por sequência remanejar livro da sequência ${e.seqInicio} até a sequência ${e.seqFim}`:''].join(' ').toLowerCase();
const meds=(e.medidores||[]).map(m=>m.numero).join(' ').toLowerCase();
return base.includes(termo)||meds.includes(termo);
}
function getFiltradas(){
return entries.filter(e=>{
const etapa=String(e.rotaDestino||'').trim();
const etapaOk=filtroEtapa==='' || (filtroEtapa==='__sem_etapa__'?etapa==='':etapaValorNormalizado(etapa)===String(filtroEtapa));
return etapaOk && entryMatchesSearch(e,filtroAtual.trim().toLowerCase());
});
}
function renderEntries(){
atualizarRespostasUI();
const filtradas=getFiltradas();
const termo=filtroAtual.trim().toLowerCase();
const etapaBusca=etapaBuscaExata(termo);
const etapaEfetiva=filtroEtapa || (etapaBusca!==null?String(etapaBusca):'');
$('entryCount').textContent=filtradas.length;
$('exportBtn').disabled=entries.length===0;
$('printBtn').disabled=filtradas.length===0;
if(!filtradas.length){
$('entriesList').innerHTML=`<div class="empty">Nenhum registro encontrado.</div>`;
return;
}
const grupos=new Map();
[...filtradas].sort((a,b)=>{
const ea=etapaNumero(a.rotaDestino), eb=etapaNumero(b.rotaDestino);
return ea-eb || (b.dataRegistro||'').localeCompare(a.dataRegistro||'') || (b.criadoEm||0)-(a.criadoEm||0);
}).forEach(e=>{
const key=String(e.rotaDestino||'').trim()||'__sem_etapa__';
if(!grupos.has(key))grupos.set(key,[]);
grupos.get(key).push(e);
});
$('entriesList').innerHTML=[...grupos.entries()].map(([key,lista])=>{
const qtdMedidores=lista.reduce((total,e)=>total+(e.medidores||[]).length,0);
const incluirImpressao=etapaEfetiva==='' || (etapaEfetiva==='__sem_etapa__'?key==='__sem_etapa__':etapaValorNormalizado(key)===String(etapaEfetiva));
return `
<section class="stage-group${incluirImpressao?' print-include':''}" data-stage-key="${escapeHtml(key)}">
<div class="stage-title"><span>${escapeHtml(etapaLabel(key))}</span><span class="stage-count">${lista.length} lançamento${lista.length===1?'':'s'} · ${qtdMedidores} medidor${qtdMedidores===1?'':'es'}</span></div>
${lista.map(e=>`
<div class="entry${e.id===editandoId?' editando':''}">
<div class="entry-top">
<span class="entry-code">${e.medidores.length>1?'Medidores / UCs':'Medidor / UC'}</span>
<div class="entry-top-actions">
<button type="button" class="entry-edit-top" data-action="editar-registro" data-id="${escapeHtml(e.id)}" title="Editar lançamento" aria-label="Editar lançamento">✏️</button>
<button type="button" class="entry-del entry-del-top" data-action="excluir-registro" data-id="${escapeHtml(e.id)}" title="Excluir lançamento inteiro" aria-label="Excluir lançamento inteiro">🗑️</button>
</div>
</div>
<span class="entry-date">📅 ${formatDateBR(e.dataRegistro)} · lançado em ${formatDateHora(e.criadoEm)}</span>
${e.solicitadoPor?`<div class="entry-meta">👤 Solicitado por <strong>${escapeHtml(e.solicitadoPor)}</strong></div>`:''}
<div class="entry-meta">
${(e.medidores||[]).map(m=>`
<div class="meter-card">
<div class="meter-head">
<span class="medidor-status ${statusClass(m.status)}" title="${statusLabel(m.status)}"></span>
<span class="meter-num">${m.livro?(e.parteLivro?'📖 ':'📚 '):''}${escapeHtml(m.numero)}</span>
<span class="meter-status-text">${statusLabel(m.status)}</span>
</div>
${m.status==='recusado'&&m.motivoRecusa?`<div class="recusa-info">⛔ Motivo: ${escapeHtml(m.motivoRecusa)}</div>`:''}
${m.transferidoPara?`<div class="transfer-info">↪ Transferido para ${formatDateBR(m.transferidoPara)}</div>`:''}
${m.origemData?`<div class="history-note">↩ Pendência transferida de ${formatDateBR(m.origemData)}</div>`:''}
<div class="meter-actions">
<button data-action="limpar-marcacao" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}"><span class="dot-cinza"></span>Pendente</button>
<button data-action="espelho" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">🔵 Espelho</button>
<button data-action="nao-realizado" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">🔴 Não realizado</button>
<button data-action="concluido" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">🟢 Concluído</button>
<button data-action="recusar" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">⛔ Recusar</button>
${m.status!=='concluido'&&m.status!=='recusado'&&!m.transferidoPara?`<button data-action="transferir" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">📅 Próximo mês</button>`:''}
</div>
<div class="meter-tools">
<button type="button" class="meter-tool save" title="Salvar marcação" aria-label="Salvar marcação" data-action="salvar-marcacao" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">💾</button>
<button type="button" class="meter-tool delete" title="Excluir este medidor" aria-label="Excluir este medidor" data-action="excluir-marcacao" data-id="${escapeHtml(e.id)}" data-mid="${escapeHtml(m.id)}">🗑️</button>
</div>
</div>
`).join('')}
</div>
${e.vizinha?`<div class="entry-meta">UC vizinha <strong>${escapeHtml(e.vizinha)}</strong></div>`:''}
${e.livro?`<div class="entry-meta">Número do livro <strong>${escapeHtml(e.livro)}</strong></div>`:''}
${e.parteLivro?`<div class="livro-todo-tag">📖 Remanejar livro da sequência ${escapeHtml(e.seqInicio)} até a sequência ${escapeHtml(e.seqFim)}</div>`:e.livroTodo?`<div class="livro-todo-tag">📚 Remanejar o livro todo</div>`:''}
${e.rua?`<div class="entry-meta">Rua: <strong>${escapeHtml(e.rua)}</strong></div>`:''}
${e.obs?`<div class="entry-obs">${escapeHtml(e.obs)}</div>`:''}
${e.fotos.length?`<div class="entry-fotos" data-entry-id="${escapeHtml(e.id)}">${e.fotos.map((f,i)=>`<img src="${f}" data-i="${i}" alt="Foto">`).join('')}</div>`:''}
${e.digitado&&e.digitadoEm?`<div class="entry-meta">Digitado em ${formatDateHora(e.digitadoEm)}</div>`:''}
<div class="entry-status-row">
<button class="entry-status-btn${e.digitado?' marcado':''}" data-action="digitado" data-id="${escapeHtml(e.id)}">${e.digitado?'Digitado ✓':'Marcar digitado'}</button>
</div>
<div class="entry-actions">
${!String(e.rotaDestino||'').trim()?`<button type="button" class="entry-stage-btn" data-action="definir-etapa" data-id="${escapeHtml(e.id)}">📌 Definir etapa</button>`:''}
<button type="button" class="entry-del" data-action="excluir-registro" data-id="${escapeHtml(e.id)}" title="Excluir lançamento inteiro">🗑️ Excluir lançamento</button>
</div>
</div>
`).join('')}
</section>`;
}).join('');
$('entriesList').querySelectorAll('.entry-fotos').forEach(container=>{
const entry=entries.find(e=>e.id===container.dataset.entryId);
if(!entry)return;
container.querySelectorAll('img').forEach(img=>img.addEventListener('click',()=>abrirModalFoto(entry.fotos,Number(img.dataset.i))));
});
$('entriesList').querySelectorAll('[data-action]').forEach(btn=>{
btn.addEventListener('click',async()=>{
const action=btn.dataset.action;
if(action==='recusar'){
abrirRecusa(btn.dataset.id,btn.dataset.mid);
return;
}
if(action==='editar-registro'){
iniciarEdicao(btn.dataset.id);
return;
}
if(action==='digitado'){
const entry=entries.find(e=>e.id===btn.dataset.id); if(!entry)return;
entry.digitado=!entry.digitado; entry.digitadoEm=entry.digitado?Date.now():null;
salvarLocal(); await salvarCloud(entry); renderEntries(); return;
}
if(action==='transferir'){
if(window.confirm('Transferir este medidor para o próximo mês? O histórico atual será mantido.')) transferirMedidor(btn.dataset.id,btn.dataset.mid);
return;
}
if(action==='salvar-marcacao'){
const entry=entries.find(e=>e.id===btn.dataset.id); const m=entry?.medidores.find(x=>x.id===btn.dataset.mid); if(!entry||!m)return;
m.statusEm=m.statusEm||Date.now(); salvarLocal(); await salvarCloud(entry);
const status=$('statusMsg'); status.textContent='Marcação salva.'; status.style.color='var(--accent)'; setTimeout(()=>status.textContent='',1800); return;
}
if(action==='limpar-marcacao'){
const entry=entries.find(e=>e.id===btn.dataset.id); const m=entry?.medidores.find(x=>x.id===btn.dataset.mid); if(!entry||!m)return;
if(m.status==='pendente')return;
if(m.transferidoPara && !window.confirm(`Voltar ${m.numero} para Pendente? Ele já foi passado para o próximo mês; o lançamento do próximo mês continua.`))return;
m.status='pendente'; m.statusEm=null; m.transferidoPara=null; m.respondidoPor=null; m.motivoRecusa=null;
salvarLocal(); await salvarCloud(entry); renderEntries(); return;
}
if(action==='excluir-marcacao'){
const entry=entries.find(e=>e.id===btn.dataset.id); const m=entry?.medidores.find(x=>x.id===btn.dataset.mid); if(!entry||!m)return;
if(entry.medidores.length<=1){alert('Este é o único item do lançamento. Para tirar ele, use "🗑️ Excluir lançamento" (administrador) ou toque no ✏️ para trocar o número.');return;}
if(!window.confirm(`Excluir o medidor ${m.numero} deste lançamento? Os outros medidores continuam.`))return;
const copiaMeds=[...entry.medidores];
entry.medidores=entry.medidores.filter(x=>x.id!==m.id);
if(m.livro){ entry.livroTodo=false; entry.parteLivro=false; entry.seqInicio=''; entry.seqFim=''; }
entry.editadoEm=Date.now();
if(!salvarLocal()){ entry.medidores=copiaMeds; alert('Não foi possível excluir. Tente de novo.'); return; }
const okNuvem=firebaseDB ? await salvarCloud(entry) : true;
renderEntries();
const st=$('statusMsg'); st.textContent=okNuvem?'Medidor excluído.':'Excluído no aparelho, mas não no Firebase.'; st.style.color=okNuvem?'var(--accent)':'var(--red)'; setTimeout(()=>st.textContent='',2500);
return;
}
if(action==='definir-etapa'){
const entry=entries.find(e=>e.id===btn.dataset.id); if(!entry)return;
const valor=window.prompt('Informe a etapa deste lançamento (1 a 18):','');
if(valor===null)return;
const etapa=String(valor).trim();
if(!/^(?:[1-9]|1[0-8])$/.test(etapa)){alert('Digite uma etapa válida de 1 a 18.');return;}
entry.rotaDestino=etapa; salvarLocal(); await salvarCloud(entry); renderEntries(); return;
}
if(action==='excluir-registro'){
const entry=entries.find(e=>e.id===btn.dataset.id); if(!entry)return;
if(!isAdmin){alert('A exclusão do lançamento inteiro é exclusiva do administrador. A lixeira do medidor continua disponível para corrigir uma marcação.');return;}
if(!window.confirm('Excluir este lançamento inteiro? Todos os medidores deste lançamento serão removidos. Esta ação não apaga outros lançamentos.'))return;
const entryId=String(entry.id||'').trim();
if(!entryId){alert('Este lançamento não possui um ID válido no Firebase.');return;}
const ok=await excluirCloud(entryId);
if(!ok){alert('Não foi possível excluir no Firebase. O lançamento foi mantido.');return;}
entries=entries.filter(e=>e.id!==entry.id);
if(editandoId===entry.id){ editandoId=null; limparFormulario(); atualizarModoEdicaoUI(); }
salvarLocal(); renderEntries(); return;
}
setMedidorStatus(btn.dataset.id,btn.dataset.mid,action);
});
});
}
function formularioTemDados(){
return medidorValores.some(v=>String(v).trim()) ||
['vizinha','livro','seqInicio','seqFim','rua','obs'].some(id=>$(id).value.trim()) ||
selectedFotos.length>0;
}
async function atualizarAplicativo(){
if(!navigator.onLine){
alert('Sem internet agora. Conecte-se e tente atualizar de novo.');
return;
}
if(formularioTemDados() && !confirm('Tem informação no formulário que ainda não foi salva. Atualizar mesmo assim? (Os registros já salvos não são afetados.)'))return;
const btn=$('updateAppBtn');
btn.disabled=true;
btn.textContent='⏳ Atualizando...';
try{
if('serviceWorker' in navigator){
const regs=await navigator.serviceWorker.getRegistrations();
for(const r of regs){ try{ await r.update(); }catch(e){} }
}
if(window.caches){
const keys=await caches.keys();
await Promise.all(keys.map(k=>caches.delete(k)));
}
}catch(err){ console.warn('Atualizar app:',err); }
const url=new URL(location.href);
url.searchParams.set('v',Date.now());
location.replace(url.toString());
}
$('updateAppBtn').addEventListener('click',atualizarAplicativo);
try{
const u=new URL(location.href);
if(u.searchParams.has('v')){
u.searchParams.delete('v');
history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);
const status=$('statusMsg');
status.textContent=`Aplicativo atualizado ✓ — versão ${APP_VERSAO}`;
status.style.color='var(--accent)';
setTimeout(()=>status.textContent='',2500);
}
}catch(e){}
$('shareAppBtn').addEventListener('click', async ()=>{
const shareData={
title:'Remanejamento de Rota',
text:'Aplicativo Remanejamento de Rota',
url:window.location.href
};
try{
if(navigator.share){
await navigator.share(shareData);
return;
}
await navigator.clipboard.writeText(window.location.href);
const status=$('statusMsg');
status.textContent='Link do aplicativo copiado para compartilhar.';
status.style.color='var(--accent)';
}catch(err){
if(err && err.name==='AbortError') return;
try{
window.prompt('Copie o link do aplicativo:',window.location.href);
}catch(e){}
}
});
$('filtroRota').addEventListener('input',e=>{
filtroAtual=e.target.value;
renderEntries();
});
$('filtroEtapaBtn').addEventListener('click',()=>{
$('filtroEtapaMenu').classList.toggle('open');
});
$('filtroEtapaMenu').querySelectorAll('[data-filtro-etapa]').forEach(btn=>{
btn.addEventListener('click',()=>{
filtroEtapa=btn.dataset.filtroEtapa;
$('filtroEtapaMenu').classList.remove('open');
$('filtroEtapaMenu').querySelectorAll('[data-filtro-etapa]').forEach(b=>b.classList.toggle('ativa',b.dataset.filtroEtapa===filtroEtapa));
$('filtroEtapaBtn').textContent=filtroEtapa==='__sem_etapa__'?'Sem etapa ▾':(filtroEtapa?`Etapa ${filtroEtapa} ▾`:'Etapa ▾');
renderEntries();
});
});
document.addEventListener('click',e=>{
if(!e.target.closest('.filtro-etapa-wrap'))$('filtroEtapaMenu').classList.remove('open');
});
function avisoCampo(msg,campoId){
const status=$('statusMsg');
status.textContent=msg;
status.style.color='var(--red)';
const el=$(campoId);
if(el){
el.scrollIntoView({behavior:'smooth',block:'center'});
setTimeout(()=>{ if(el.focus)el.focus(); },300);
}
}
$('saveBtn').addEventListener('click',()=>{
const medidores=medidorValores.map(v=>v.trim()).filter(Boolean);
const data=$('dataRegistro').value||todayStr();
const vizinha=$('vizinha').value.trim();
const livro=$('livro').value.trim();
const rotaDestino=$('rotaDestino').value.trim();
const rua=$('rua').value.trim();
const obs=$('obs').value.trim();
const status=$('statusMsg');
const btn=$('saveBtn');
if(!rotaDestino){
status.textContent='Selecione a etapa antes de salvar.';
status.style.color='var(--red)';
$('etapaSelect').scrollIntoView({behavior:'smooth',block:'center'});
return;
}
if(!rotaDestino || !/^([1-9]|1[0-8])$/.test(rotaDestino)){
btn.disabled=false;
status.textContent='Selecione uma etapa (1 a 18) antes de salvar.';
status.style.color='var(--red)';
$('etapaSelect').scrollIntoView({behavior:'smooth',block:'center'});
return;
}
const solicitadoPor=$('solicitadoPor').value.trim().replace(/\s+/g,' ');
if(!solicitadoPor){
avisoCampo('Preencha "Solicitado por" antes de salvar.','solicitadoPor');
return;
}
const livroTodo=tipoRem==='livro-todo';
const parteLivro=tipoRem==='parte-livro';
if((livroTodo||parteLivro) && !livro){
avisoCampo(parteLivro?'Informe o número do livro para remanejar por sequência.':'Informe o número do livro para remanejar o livro todo.','livro');
return;
}
let seqInicio='', seqFim='';
if(parteLivro){
const ini=$('seqInicio').value.trim();
const fim=$('seqFim').value.trim();
if(!ini){ avisoCampo('Preencha "Da sequência".','seqInicio'); return; }
if(!fim){ avisoCampo('Preencha "Até a sequência".','seqFim'); return; }
if(Number(ini)>Number(fim)){ avisoCampo('"Da sequência" não pode ser maior que "Até a sequência".','seqInicio'); return; }
seqInicio=String(Number(ini));
seqFim=String(Number(fim));
}
if(!livroTodo && !parteLivro && !medidores.length){
status.textContent='Digite o número do medidor / UC (ou escolha Livro todo / Por sequência).';
status.style.color='var(--red)';
$('medidorList').scrollIntoView({behavior:'smooth',block:'center'});
setTimeout(()=>{ const inp=$('medidorList').querySelector('.medidor-input'); if(inp)inp.focus(); },300);
return;
}
if(editandoId){
salvarEdicao({medidores,data,vizinha,livro,rotaDestino,rua,obs,solicitadoPor,livroTodo,parteLivro,seqInicio,seqFim});
return;
}
try{ localStorage.setItem(CHAVE_MEU_NOME,solicitadoPor); }catch(e){}
btn.disabled=true;
status.textContent='Salvando...';
status.style.color='var(--text-dim)';
const novo={
id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),
medidores:[
...medidores.map((numero,i)=>({
id:'m'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,4),
numero,status:'pendente',statusEm:null,transferidoPara:null,origemId:null,origemData:null
})),
...((livroTodo||parteLivro)?[itemLivro(livro,parteLivro,seqInicio,seqFim)]:[])
],
dataRegistro:data,
solicitadoPor,
livroTodo,
parteLivro,
seqInicio,
seqFim,
solicitanteUid:firebaseUser?.uid||null,
vizinha,livro,rotaDestino,rua,obs,
fotos:[...selectedFotos],
digitado:false,digitadoEm:null,criadoEm:Date.now()
};
entries.push(novo);
if(!salvarLocal()){
entries.pop();
btn.disabled=false;
status.textContent='Não foi possível salvar. Verifique o armazenamento do navegador.';
status.style.color='var(--red)';
return;
}
salvarCloud(novo);
renderEntries();
limparFormulario();
btn.disabled=false;
status.textContent='Registro salvo com sucesso.';
status.style.color='var(--accent)';
setTimeout(()=>status.textContent='',2500);
});
function escapeCsv(valor){
const str=String(valor??'');
if(/[;"\n\r]/.test(str))return '"'+str.replace(/"/g,'""')+'"';
return str;
}
function exportarCSV(){
const registros=getFiltradas();
if(!registros.length)return;
const cabecalho=[
'Etapa','Solicitado por','Número do medidor / UC','Status','Motivo da recusa','UC vizinha','Número do livro','Tipo de remanejamento','Da sequência','Até a sequência','Rua','Data do registro',
'Observações','Lançado em','Qtd. fotos','Digitado','Digitado em','Transferido para','Origem'
];
const linhas=[];
[...registros].sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)).forEach(e=>{
const medidores=e.medidores||[];
const tipo=textoTipo(e);
const sIni=e.parteLivro?(e.seqInicio||''):'';
const sFim=e.parteLivro?(e.seqFim||''):'';
if(!medidores.length){
linhas.push([e.rotaDestino?`Etapa ${e.rotaDestino}`:'Sem etapa',e.solicitadoPor||'','', '','',e.vizinha||'',e.livro||'',tipo,sIni,sFim,e.rua||'',e.dataRegistro||'',e.obs||'',formatDateHora(e.criadoEm),e.fotos?.length||0,e.digitado?'Sim':'Não',e.digitado?formatDateHora(e.digitadoEm):'','','']);
return;
}
medidores.forEach(m=>linhas.push([
e.rotaDestino?`Etapa ${e.rotaDestino}`:'Sem etapa',e.solicitadoPor||'',m.numero||'',statusLabel(m.status),m.status==='recusado'?(m.motivoRecusa||''):'',e.vizinha||'',e.livro||'',tipo,sIni,sFim,e.rua||'',e.dataRegistro||'',e.obs||'',
formatDateHora(e.criadoEm),e.fotos?.length||0,e.digitado?'Sim':'Não',e.digitado?formatDateHora(e.digitadoEm):'',m.transferidoPara?formatDateBR(m.transferidoPara):'',m.origemData?formatDateBR(m.origemData):''
]));
});
const csv='\uFEFF'+[cabecalho.join(';'),...linhas.map(l=>l.map(escapeCsv).join(';'))].join('\r\n');
const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a'); a.href=url; a.download=`remanejamento-rota-${todayStr()}.csv`;
document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('exportBtn').addEventListener('click',exportarCSV);
$('printBtn').addEventListener('click',()=>{
const filtradas=getFiltradas();
if(!filtradas.length){alert('Nenhum registro para imprimir.');return;}
document.body.classList.add('print-stage-mode');
window.addEventListener('afterprint',()=>document.body.classList.remove('print-stage-mode'),{once:true});
window.print();
});
$('adminBtn').addEventListener('click',async()=>{
if(!isAdmin){
if(canUseWebAuthnSync() && temBiometria() && firebaseModules?.authInstance){
desbloquearPorBiometria();
}
await loginAdministrador();
return;
}
const panel=$('adminPanel');
panel.style.display=panel.style.display==='none'?'block':'none';
if(panel.style.display==='block'){ localStorage.setItem('remanejamento-admin-unlocked-at',String(Date.now())); atualizarBotaoFaceId(); await renderAdminPanel(); }
});
$('faceIdBtn').addEventListener('click',()=>{
if(!canUseWebAuthnSync()){
alert('Este aparelho ou navegador não permite Face ID aqui. Abra o app pelo Safari ou pelo ícone na tela de início.');
return;
}
registrarBiometria().then(ok=>{
atualizarBotaoFaceId();
alert(ok
? 'Face ID ativado! Da próxima vez, é só tocar no 🔐 lá em cima.'
: 'O Face ID não foi ativado. Tente de novo e confirme com o rosto quando o iPhone pedir.');
});
});
$('adminPinBtn').addEventListener('click',desbloquearPorPin);
$('adminBiometricBtn').addEventListener('click',desbloquearPorBiometria);
$('adminPasswordBtn').addEventListener('click',mostrarLoginSenha);
$('adminLoginSubmit').addEventListener('click',autenticarComSenha);
$('adminBackToPinBtn').addEventListener('click',voltarParaPin);
$('adminPasswordEye').addEventListener('click',alternarSenha);
$('adminCancelBtn').addEventListener('click',()=>$('adminLock').classList.remove('open'));
$('adminPinInput').addEventListener('keydown',e=>{if(e.key==='Enter')desbloquearPorPin();});
$('adminPinInput').addEventListener('input',e=>{
const limpo=e.target.value.replace(/\D/g,'').slice(0,4);
if(e.target.value!==limpo)e.target.value=limpo;
});
$('adminPasswordInput').addEventListener('keydown',e=>{if(e.key==='Enter')autenticarComSenha();});
$('adminRefreshBtn').addEventListener('click',renderAdminPanel);
$('addAdminBtn').addEventListener('click',adicionarAdministrador);
$('adminLogoutBtn').addEventListener('click',sairAdministrador);
const ADMIN_UNLOCK_TTL=48*60*60*1000;
function adminUnlockExpired(){
const t=Number(localStorage.getItem('remanejamento-admin-unlocked-at')||0);
return !t || (Date.now()-t)>ADMIN_UNLOCK_TTL;
}
function lockAdminArea(){
isAdmin=false;
const panel=$('adminPanel'); if(panel)panel.style.display='none';
atualizarAdminUI();
}
setInterval(()=>{ if(isAdmin && adminUnlockExpired()) lockAdminArea(); },60000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && isAdmin && adminUnlockExpired()) lockAdminArea(); });
window.addEventListener('offline',()=>setConexao('desconectado'));
$('conexaoBadge').addEventListener('click',()=>{renderLegendaConexao();$('conexaoModal').classList.add('open');});
$('conexaoFecharBtn').addEventListener('click',()=>$('conexaoModal').classList.remove('open'));
$('conexaoModal').addEventListener('click',e=>{ if(e.target.id==='conexaoModal')$('conexaoModal').classList.remove('open'); });
window.addEventListener('online',()=>setConexao(firebaseDB?'conectando':'desconectado'));
entries=lerDados();
normalizarRegistros();
if(entries.length)salvarLocal();
definirTipo('cliente');
renderEntries();
lockAdminArea();
initFirebase();
