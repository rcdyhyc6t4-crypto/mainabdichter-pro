const DRAFT_KEY = 'mainabdichter_v26_drafts';
const REMINDER_KEY = 'mainabdichter_v26_reminders';
const LAST_DRAFT_KEY = 'mainabdichter_v26_active_draft';

const $ = id => document.getElementById(id);
const q = (s, root=document) => root.querySelector(s);
const qa = (s, root=document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function readJson(key, fallback){ try { const v=JSON.parse(localStorage.getItem(key)||'null'); return v ?? fallback; } catch { return fallback; } }
function writeJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function customerName(){
  const vals=['salutation','firstName','lastName'].map(id=>$(id)?.value?.trim()).filter(Boolean);
  return vals.join(' ') || $('company')?.value?.trim() || 'Unbenannter Vorgang';
}
function objectAddress(){
  return $('objectAddress')?.value?.trim() || [$('street')?.value,$('zip')?.value,$('city')?.value].map(v=>v?.trim()).filter(Boolean).join(', ');
}
function draftId(){
  const visitNumber=$('visitNumber')?.value?.trim() || $('metaVisitNumber')?.textContent?.trim();
  const stored=localStorage.getItem(LAST_DRAFT_KEY);
  if(stored) return stored;
  const id=(visitNumber && visitNumber !== '–') ? `visit-${visitNumber}` : crypto.randomUUID();
  localStorage.setItem(LAST_DRAFT_KEY,id); return id;
}
function snapshotForm(){
  const data={};
  qa('#visit input,#visit select,#visit textarea,#offer input,#offer select,#offer textarea').forEach(el=>{
    if(!el.id || el.type==='file') return;
    data[el.id]=el.type==='checkbox'?el.checked:el.value;
  });
  return data;
}
function restoreForm(data){
  Object.entries(data||{}).forEach(([id,value])=>{
    const el=$(id); if(!el) return;
    if(el.type==='checkbox') el.checked=Boolean(value); else el.value=value ?? '';
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
function requiredStatus(){
  const rules=[
    ['firstName','Vorname oder Firma',()=>Boolean($('firstName')?.value?.trim()||$('company')?.value?.trim())],
    ['lastName','Nachname oder Firma',()=>Boolean($('lastName')?.value?.trim()||$('company')?.value?.trim())],
    ['street','Straße',()=>Boolean($('street')?.value?.trim())],
    ['zip','PLZ',()=>Boolean($('zip')?.value?.trim())],
    ['city','Ort',()=>Boolean($('city')?.value?.trim())]
  ];
  const areaRows=qa('[data-area-id],.area-card');
  const complete=rules.filter(r=>r[2]()).length;
  const total=rules.length + (areaRows.length?1:0);
  const done=complete + (areaRows.length?1:0);
  return {done,total,percent:total?Math.round(done/total*100):0,missing:rules.filter(r=>!r[2]()).map(r=>r[1])};
}
function saveDraft(show=false){
  const drafts=readJson(DRAFT_KEY,[]);
  const id=draftId(); const status=requiredStatus(); const now=new Date().toISOString();
  const record={id,name:customerName(),address:objectAddress(),updatedAt:now,progress:status.percent,missing:status.missing,form:snapshotForm(),page:q('.page.active')?.id||'visit'};
  const i=drafts.findIndex(d=>d.id===id); if(i>=0) drafts[i]=record; else drafts.unshift(record);
  writeJson(DRAFT_KEY,drafts.slice(0,50));
  const stamp=$('autosaveStamp'); if(stamp) stamp.textContent=`Automatisch gespeichert: ${new Date(now).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}`;
  renderDrafts(); updateRequiredUi();
  if(show) toast('Zwischenstand gespeichert.');
}
function deleteDraft(id){ writeJson(DRAFT_KEY,readJson(DRAFT_KEY,[]).filter(d=>d.id!==id)); if(localStorage.getItem(LAST_DRAFT_KEY)===id)localStorage.removeItem(LAST_DRAFT_KEY); renderDrafts(); }
function resumeDraft(id){ const d=readJson(DRAFT_KEY,[]).find(x=>x.id===id); if(!d)return; localStorage.setItem(LAST_DRAFT_KEY,id); restoreForm(d.form); const target=q(`[data-bottom-page="${d.page}"]`)||q(`[data-menu-page="${d.page}"]`); if(target)target.click(); else q('[data-bottom-page="dashboard"]')?.click(); toast(`„${d.name}“ wurde geöffnet.`); }
function renderDrafts(){
  const box=$('dashboardDraftList'); if(!box)return; const drafts=readJson(DRAFT_KEY,[]);
  $('dashboardDraftCount').textContent=String(drafts.length);
  box.innerHTML=drafts.length?drafts.map(d=>`<article class="v26-draft-card"><button class="v26-draft-open" data-resume-draft="${esc(d.id)}"><span><strong>${esc(d.name)}</strong><small>${esc(d.address||'Adresse noch offen')}</small></span><span class="v26-progress"><i style="width:${d.progress}%"></i></span><b>${d.progress}%</b><small>zuletzt ${new Date(d.updatedAt).toLocaleString('de-DE')}</small></button><button class="v26-icon-button" data-delete-draft="${esc(d.id)}" aria-label="Entwurf löschen">×</button></article>`).join(''):'<div class="empty-mini">Keine angefangene Datenerfassung.</div>';
  qa('[data-resume-draft]',box).forEach(b=>b.onclick=()=>resumeDraft(b.dataset.resumeDraft));
  qa('[data-delete-draft]',box).forEach(b=>b.onclick=()=>confirm('Zwischenstand wirklich löschen?')&&deleteDraft(b.dataset.deleteDraft));
}
function renderReminders(){
  const box=$('dashboardReminderList'); if(!box)return; const items=readJson(REMINDER_KEY,[]);
  box.innerHTML=items.length?items.map(i=>`<label class="v26-reminder"><input type="checkbox" data-reminder-done="${esc(i.id)}"><span>${esc(i.text)}</span><button data-reminder-delete="${esc(i.id)}">×</button></label>`).join(''):'<div class="empty-mini">Nichts vorgemerkt.</div>';
  qa('[data-reminder-done]',box).forEach(el=>el.onchange=()=>removeReminder(el.dataset.reminderDone));
  qa('[data-reminder-delete]',box).forEach(el=>el.onclick=e=>{e.preventDefault();removeReminder(el.dataset.reminderDelete);});
}
function removeReminder(id){writeJson(REMINDER_KEY,readJson(REMINDER_KEY,[]).filter(x=>x.id!==id));renderReminders();}
function addReminder(){const input=$('dashboardReminderInput');const text=input?.value.trim();if(!text)return;const items=readJson(REMINDER_KEY,[]);items.unshift({id:crypto.randomUUID(),text,createdAt:new Date().toISOString()});writeJson(REMINDER_KEY,items);input.value='';renderReminders();}
function updateRequiredUi(){
  const s=requiredStatus(); const bar=$('visitCompletionBar'); if(bar)bar.style.width=`${s.percent}%`; if($('visitCompletionText'))$('visitCompletionText').textContent=`${s.percent}% vollständig`;
  if($('visitMissingFields'))$('visitMissingFields').innerHTML=s.missing.length?`Noch Pflicht: ${s.missing.map(esc).join(', ')}`:'Alle grundlegenden Pflichtfelder sind vollständig.';
}
function markRequiredFields(){
  const required=['firstName','lastName','street','zip','city'];
  required.forEach(id=>{const el=$(id); if(!el)return; const label=el.closest('div')?.querySelector('label')||el.previousElementSibling; if(label&&!label.querySelector('.v26-required')) label.insertAdjacentHTML('beforeend',' <span class="v26-required">Pflicht</span>');});
  qa('#visit label,#offer label').forEach(label=>{if(!label.querySelector('.v26-required')&&!label.querySelector('.v26-optional')) label.insertAdjacentHTML('beforeend',' <span class="v26-optional">optional</span>');});
}
function collapseSettings(){qa('#settings details').forEach(d=>d.open=false);}
function convertOfferCards(){
  const offer=$('offer'); if(!offer)return;
  const cards=qa(':scope > .card',offer);
  cards.forEach(card=>{
    const h=card.querySelector('h1,h2'); const text=(h?.textContent||'').toLowerCase();
    if(text.includes('angebot')||text.includes('preisstrategie')){
      const details=document.createElement('details'); details.className=card.className+' v26-offer-details';
      const summary=document.createElement('summary'); summary.textContent=text.includes('preis')?'Preisgestaltung':'Skonto / Sonderaktion';
      while(card.firstChild) details.appendChild(card.firstChild); details.prepend(summary); card.replaceWith(details);
    }
  });
}
function addSyncPanel(){
  if($('syncResultPanel'))return;
  const panel=document.createElement('section'); panel.id='syncResultPanel'; panel.className='v26-sync-panel'; panel.innerHTML='<strong>Synchronisationsstatus</strong><div><span>Lexware</span><b id="v26LexwareState">Noch nicht geprüft</b></div><div><span>Pipedrive</span><b id="v26PipedriveState">Noch nicht geprüft</b></div><small>Nach Importen und Baustellenanlagen werden beide Systeme getrennt angezeigt.</small>';
  $('dashboard')?.querySelector('.dashboard-welcome')?.after(panel);
  window.addEventListener('unhandledrejection',e=>{const msg=String(e.reason?.message||e.reason||'Fehler'); if(/lexware/i.test(msg))setSync('lexware',false,msg); if(/pipedrive/i.test(msg))setSync('pipedrive',false,msg);});
}
function setSync(system,ok,msg){const el=$(system==='lexware'?'v26LexwareState':'v26PipedriveState');if(!el)return;el.textContent=(ok?'✓ ':'✕ ')+(msg|| (ok?'erfolgreich':'Fehler'));el.className=ok?'sync-ok':'sync-error';}
function observeStatuses(){
  const obs=new MutationObserver(records=>records.forEach(r=>{const t=r.target.textContent||''; if(!t.trim())return; if(/lexware/i.test(t))setSync('lexware',!/fehler|nicht|abgebrochen|konnte/i.test(t),t.slice(0,120)); if(/pipedrive/i.test(t))setSync('pipedrive',!/fehler|nicht|abgebrochen|konnte/i.test(t),t.slice(0,120));}));
  qa('.status').forEach(el=>obs.observe(el,{childList:true,subtree:true,characterData:true}));
}
function toast(text){let el=$('v26Toast');if(!el){el=document.createElement('div');el.id='v26Toast';el.className='v26-toast';document.body.appendChild(el);}el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800);}
function injectDashboard(){
  if($('dashboardDraftList'))return;
  const inventory=q('.dashboard-inventory-section');
  const html=`<section class="dashboard-section v26-workflow-section"><div class="section-title"><div><span>WEITERMACHEN</span><h2>In Bearbeitung <b id="dashboardDraftCount">0</b></h2></div></div><div id="dashboardDraftList" class="v26-draft-list"></div></section><section class="dashboard-section"><div class="section-title"><div><span>ASSISTENT</span><h2>Nicht vergessen</h2></div></div><div class="v26-reminder-entry"><input id="dashboardReminderInput" placeholder="z. B. Herrn Schulz zurückrufen"><button id="dashboardReminderAdd" class="primary">Hinzufügen</button></div><div id="dashboardReminderList"></div></section>`;
  inventory?.insertAdjacentHTML('beforebegin',html);
  $('dashboardReminderAdd').onclick=addReminder; $('dashboardReminderInput').onkeydown=e=>{if(e.key==='Enter')addReminder();};
}
function injectVisitStatus(){
  if($('autosaveStamp'))return;
  const toolbar=q('.visit-toolbar'); toolbar?.insertAdjacentHTML('afterend',`<section class="card v26-visit-status"><div><strong id="visitCompletionText">0% vollständig</strong><span id="autosaveStamp">Noch nicht automatisch gespeichert</span></div><div class="v26-progress-wide"><i id="visitCompletionBar"></i></div><p id="visitMissingFields"></p><button id="saveDraftNow" class="secondary">Jetzt zwischenspeichern</button></section>`);
  $('saveDraftNow').onclick=()=>saveDraft(true);
}
function removeMaterialButton(){ $('deductInventory')?.remove(); }
function makeSettingsSearch(){
  if($('settingsSearch'))return; const first=q('#settings > .card'); first?.insertAdjacentHTML('beforeend','<input id="settingsSearch" class="v26-settings-search" placeholder="Einstellung suchen, z. B. Packer oder Lexware">');
  $('settingsSearch').oninput=e=>{const term=e.target.value.trim().toLowerCase();qa('#settings details').forEach(d=>{const hit=!term||d.textContent.toLowerCase().includes(term);d.hidden=!hit;if(term&&hit)d.open=true;});};
}
function bindAutosave(){
  let timer; const handler=e=>{if(!e.target.closest('#visit,#offer,#worksites'))return;clearTimeout(timer);timer=setTimeout(()=>saveDraft(false),700);};
  document.addEventListener('input',handler,true); document.addEventListener('change',handler,true); setInterval(()=>{if(q('#visit.active,#offer.active'))saveDraft(false);},15000);
}
function enhanceWorksite(){
  const title=q('#worksites h1'); if(title&&!$('worksitePhase1Hint')) title.insertAdjacentHTML('afterend','<p id="worksitePhase1Hint" class="v26-worksite-hint">Baustellen bleiben vollständig nutzbar: Ist-Werte, Wandstärke, Material, Fotos, PDF, Pipedrive und Abschluss.</p>');
}
function start(){
  injectDashboard();injectVisitStatus();addSyncPanel();removeMaterialButton();convertOfferCards();collapseSettings();makeSettingsSearch();markRequiredFields();bindAutosave();enhanceWorksite();renderDrafts();renderReminders();updateRequiredUi();observeStatuses();
  window.mainabdichterV26={saveDraft,resumeDraft,setSync};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
