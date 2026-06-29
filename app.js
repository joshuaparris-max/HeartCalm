/* =========================================================================
   Calm — app.js (ES module)
   All DOM/behaviour logic. Pure helpers live in pure.js.
   ========================================================================= */
import {
  fmt, pad2, escHtml, logsToText, logsToCSV, aggregatePrep, gpStats,
  bpmFromTaps, dailyCounts, average, parsePattern, phasesToString, icsForReminders,
  bucketForDuration, escalationLevel,
  recentOpens, shouldShowGuardrail, CALM_COPY,
  SCHEMA_VERSION, normalizeEntry, normalizeLogs, entrySymptoms, entryReliever,
} from './pure.js';

const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ data */
const RESOURCES = [
  { title:"NHS — Breathing exercise for stress",
    url:"https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/",
    note:"Simple official breathing guide" },
  { title:"Healthdirect — Heart palpitations (Australia)",
    url:"https://www.healthdirect.gov.au/heart-palpitations",
    note:"What palpitations are and when to seek help" },
  { title:"Smiling Mind (free, Australian)",
    url:"https://www.smilingmind.com.au/",
    note:"Free mindfulness app & exercises" },
  { title:"Guided 4-6 breathing (video)",
    url:"https://www.youtube.com/results?search_query=4-6+breathing+exercise",
    note:"Pick one you like" },
  { title:"Box breathing guided (video)",
    url:"https://www.youtube.com/results?search_query=box+breathing+guided",
    note:"Alternate pattern" },
];

const DEFAULT_REMINDERS = [
  { id:"r1", time:"07:30", label:"Water + food + 5 min breathing", on:true },
  { id:"r2", time:"10:30", label:"Water check", on:true },
  { id:"r3", time:"12:30", label:"Lunch + 5 min breathing", on:true },
  { id:"r4", time:"15:00", label:"Water + posture reset", on:true },
  { id:"r5", time:"19:00", label:"Light dinner / reflux precautions", on:true },
  { id:"r6", time:"21:00", label:"5 min breathing + symptom log", on:true },
];

/* Built-in breathing patterns. Users can add their own (settings.patterns). */
const BUILTIN_PATTERNS = {
  '46':  { name:'4–6 breathing', phases:[['in',4],['out',6]] },
  'box': { name:'Box 4-4-4-4', phases:[['in',4],['hold',4],['out',4],['hold',4]] },
  '478': { name:'4-7-8 calming', phases:[['in',4],['hold',7],['out',8]] },
  'coherent': { name:'Coherent 5-5', phases:[['in',5],['out',5]] },
};
const CUE = { in:'Breathe in', out:'Breathe out', hold:'Hold' };

const FLAG_LABEL = { cough:'Cough', dizzy:'Dizzy', chestpain:'Chest pain', breathless:'Breathless',
  wheeze:'Wheeze', tightchest:'Tight chest', flushed:'Hot/flushed face', fainted:'Faint/near-faint',
  irregular:'Irregular pulse', ventolin:'Ventolin',
  // Stage-2 associated symptoms
  breathless_mild:'Mild breathlessness', sweating:'Sweating/clammy', nausea:'Nausea',
  radiating:'Radiating pain', confusion:'Confusion', reflux:'Reflux/indigestion',
  chestwall:'Chest wall/rib pain', headache:'Headache', tingling:'Tingling/numbness' };
const RED = ['chestpain','breathless','fainted'];

/* Three-level escalation messaging. The decision logic lives in pure.js
   (escalationLevel); this just renders the matching banner into a target.
   Healthdirect's helpline number is used for the same-day path. */
const ESC_MSG = {
  '000': '<strong>This may need urgent assessment.</strong> Call <strong>000</strong> now — especially if symptoms are severe, spreading, worsening, or not settling.',
  'sameday': '<strong>Worth getting checked today.</strong> Call your GP or Healthdirect on <strong>1800&nbsp;022&nbsp;222</strong> — particularly if this keeps happening, lasts a while, or comes on with exertion.',
};
function renderAlert(el, result){
  el.classList.remove('is-000', 'is-sameday');
  if(!result || result.level === 'log'){ el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.classList.add(result.level === '000' ? 'is-000' : 'is-sameday');
  el.innerHTML = '<p>' + ESC_MSG[result.level] + '</p>';
}

/* ------------------------------------------------------------------ anti-spiral
   "Help me calm down, capture what a doctor needs, then get me off the phone."
   Post-save calm handoff + a gentle repeated-checking guardrail + a panic-state
   help button. No diagnosis, scores, predictions or correlation dashboards. */
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }
function fillAlert(el, level, text){
  el.classList.remove('hidden', 'is-000', 'is-sameday');
  if(level) el.classList.add(level === '000' ? 'is-000' : 'is-sameday');
  el.innerHTML = '<p>' + escHtml(text) + '</p>';
}

// post-save calm handoff
function openCalmHandoff(){
  $('calmSavedMsg').textContent = CALM_COPY.saved;
  $('prayerText').textContent = CALM_COPY.prayer;
  $('calmDoneMsg').textContent = CALM_COPY.doneTitle;
  $('calmDoneSafety').textContent = CALM_COPY.doneSafety;
  $('prayerCard').open = false;
  $('calmStage1').classList.remove('hidden');
  $('calmStage2').classList.add('hidden');
  openModal('calmHandoff');
}
function showCalmFinal(title, safety){
  $('calmDoneMsg').textContent = title;
  $('calmDoneSafety').textContent = safety || '';
  $('calmStage1').classList.add('hidden');
  $('calmStage2').classList.remove('hidden');
  openModal('calmHandoff');
}
$('calmDone').onclick = () => showCalmFinal(CALM_COPY.doneTitle, CALM_COPY.doneSafety);
$('calmClose').onclick = () => closeModal('calmHandoff');
$('calmDetails').onclick = () => { closeModal('calmHandoff'); show('log'); openDetailForm(lastSavedTs); };
$('calmBreathe').onclick = () => { closeModal('calmHandoff'); show('breathe'); startBreathing(60); };

// repeated-checking guardrail — gentle, non-shaming, never blocks help or traps
let guardrailDismissed = false;
function openGuardrail(){
  $('guardrailMsg').textContent = CALM_COPY.guardrail;
  renderAlert($('grDetail'), null);
  openModal('guardrail');
}
$('grEmergency').onclick = () => fillAlert($('grDetail'), '000', CALM_COPY.emergency);
$('grSameday').onclick   = () => fillAlert($('grDetail'), 'sameday', CALM_COPY.sameday);
$('grEnough').onclick    = () => { guardrailDismissed = true; closeModal('guardrail'); showCalmFinal(CALM_COPY.loggedEnough, ''); };
$('grContinue').onclick  = () => { guardrailDismissed = true; closeModal('guardrail'); };

function recordOpenAndMaybeGuard(){
  const now = Date.now();
  const opens = recentOpens([...LS.get('opens', []), now], now);
  LS.set('opens', opens);
  if(guardrailDismissed || !state.settings.onboarded) return;
  if(document.querySelector('.modal.show')) return; // don't stack over onboarding/handoff
  if(shouldShowGuardrail(opens, now)) openGuardrail();
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') recordOpenAndMaybeGuard();
});

// panic-state: emergency guidance one tap away on the palpitation screen
$('palpHelpNow').onclick = () => {
  const d = $('palpHelpDetail');
  const nowHidden = d.classList.toggle('hidden');
  if(!nowHidden){ d.innerHTML = '<p>' + escHtml(CALM_COPY.emergency) + '</p>'; vibe(30); }
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ storage */
const LS = {
  get(k, d){ try{ const v = JSON.parse(localStorage.getItem(k)); return v ?? d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
};
const DEFAULT_SETTINGS = { theme:'dark', chime:false, vibe:false, voice:false, dim:false,
  dur:300, pattern:'46', onboarded:false, patterns:[] };
const DEFAULT_EMERGENCY = { conditions:'', meds:'', allergies:'', contactName:'', contactPhone:'', notes:'' };

const state = {
  logs: LS.get('logs', []),
  reminders: LS.get('reminders', DEFAULT_REMINDERS),
  settings: Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {})),
  care: LS.get('care', []),
  emergency: Object.assign({}, DEFAULT_EMERGENCY, LS.get('emergency', {})),
};
function save(){
  LS.set('logs', state.logs); LS.set('reminders', state.reminders);
  LS.set('settings', state.settings); LS.set('care', state.care);
  LS.set('emergency', state.emergency);
}

/* All known patterns (builtin + custom), keyed by id. */
function allPatterns(){
  const out = Object.assign({}, BUILTIN_PATTERNS);
  (state.settings.patterns || []).forEach(p => { out[p.id] = { name:p.name, phases:p.phases }; });
  return out;
}
function currentPattern(){
  const all = allPatterns();
  return all[state.settings.pattern] || all['46'];
}

/* ------------------------------------------------------------------ theme */
function applyTheme(){
  document.documentElement.dataset.theme = state.settings.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', state.settings.theme === 'dark' ? '#11161c' : '#eef1f3');
}
applyTheme();
$('themeBtn').onclick = () => {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); save();
};

/* Private mode — blur sensitive content on screen (e.g. at work). Session-only. */
let privateMode = false;
$('privacyBtn').onclick = () => {
  privateMode = !privateMode;
  document.body.classList.toggle('private', privateMode);
  $('privacyBtn').textContent = privateMode ? '🙉 Private on' : '🙈 Private';
};

/* ------------------------------------------------------------------ nav */
function show(view){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if(view === 'log') stampLog();
  if(view === 'more'){ renderPrep(); renderTrends(); }
  if(view === 'palp'){ renderEmergencyCard(); renderPalpChecks(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.view));

/* ------------------------------------------------------------------ audio / haptics */
let audioCtx = null;
function ensureAudio(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){ audioCtx = null; }
  return audioCtx;
}
/* Continuous guide tone: rises on inhale, falls on exhale, steady on hold. */
function guideTone(type, secs){
  if(!state.settings.chime) return;
  if(!ensureAudio()) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.connect(g); g.connect(audioCtx.destination);
  const lo = 320, hi = 480;
  if(type === 'in'){ o.frequency.setValueAtTime(lo, now); o.frequency.linearRampToValueAtTime(hi, now + secs); }
  else if(type === 'out'){ o.frequency.setValueAtTime(hi, now); o.frequency.linearRampToValueAtTime(lo, now + secs); }
  else { o.frequency.setValueAtTime(lo, now); }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.18);
  g.gain.setValueAtTime(0.05, now + Math.max(0.25, secs - 0.35));
  g.gain.exponentialRampToValueAtTime(0.0001, now + secs);
  o.start(now); o.stop(now + secs + 0.05);
}
function completionChime(){
  if(!state.settings.chime || !ensureAudio()) return;
  const now = audioCtx.currentTime;
  [528, 660].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
    const t = now + i * 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.start(t); o.stop(t + 0.65);
  });
}
function vibe(ms){ if(state.settings.vibe && navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} } }
function speakCue(type){
  if(!state.settings.voice || !('speechSynthesis' in window)) return;
  try{
    const u = new SpeechSynthesisUtterance(CUE[type]);
    u.rate = 0.9; u.volume = 0.8; u.pitch = 0.95;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){}
}

/* ------------------------------------------------------------------ breathing controls */
function renderPatternButtons(){
  const wrap = $('patternBtns');
  const all = allPatterns();
  wrap.innerHTML = Object.entries(all).map(([id, p]) =>
    `<button class="btn ${id === state.settings.pattern ? 'on' : ''}" data-pattern="${escHtml(id)}">${escHtml(p.name)}</button>`
  ).join('');
  wrap.querySelectorAll('[data-pattern]').forEach(b => b.onclick = () => {
    state.settings.pattern = b.dataset.pattern; save(); renderPatternButtons();
  });
}
document.querySelectorAll('[data-dur]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-dur]').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); state.settings.dur = +b.dataset.dur; save();
});
function syncBreatheButtons(){
  document.querySelectorAll('[data-dur]').forEach(x => x.classList.toggle('on', +x.dataset.dur === state.settings.dur));
  renderPatternButtons();
  $('toggleChime').textContent = state.settings.chime ? '🔔 Sound on' : '🔕 Sound off';
  $('toggleChime').classList.toggle('on', state.settings.chime);
  $('toggleVibe').textContent = state.settings.vibe ? '📳 Vibration on' : '📳 Vibration off';
  $('toggleVibe').classList.toggle('on', state.settings.vibe);
  $('toggleVoice').textContent = state.settings.voice ? '🗣 Voice on' : '🗣 Voice off';
  $('toggleVoice').classList.toggle('on', state.settings.voice);
  $('toggleDim').textContent = state.settings.dim ? '🌙 Dim on' : '🌙 Dim';
  $('toggleDim').classList.toggle('on', state.settings.dim);
}
$('toggleChime').onclick = () => { state.settings.chime = !state.settings.chime; if(state.settings.chime) ensureAudio(); save(); syncBreatheButtons(); };
$('toggleVibe').onclick  = () => { state.settings.vibe  = !state.settings.vibe;  save(); syncBreatheButtons(); };
$('toggleVoice').onclick = () => { state.settings.voice = !state.settings.voice; save(); syncBreatheButtons(); };
$('toggleDim').onclick   = () => { state.settings.dim   = !state.settings.dim;   save(); syncBreatheButtons(); applyDim(); };
function applyDim(){ $('overlay').classList.toggle('dim', !!state.settings.dim); }

/* ------------------------------------------------------------------ breathing engine */
let breath = null;
function startBreathing(overrideDur){
  ensureAudio(); // resume on the user gesture so the first cue is reliable
  const pat = currentPattern();
  const total = overrideDur || state.settings.dur;
  $('ovPattern').textContent = pat.name;
  applyDim();
  $('overlay').classList.add('show');
  let remaining = total;
  let pi = 0, t = pat.phases[0][1];
  let curScale = 1;
  $('ovTime').textContent = fmt(remaining);
  setPhase(pat.phases[0][0], t);

  function setPhase(type, secs){
    $('ovCue').textContent = CUE[type];
    if(type === 'in') curScale = 2.0;
    else if(type === 'out') curScale = 0.85;
    // 'hold' keeps the current size (fixes the box-breathing jump bug)
    if(!reduceMotion){
      $('ovCircle').style.transitionDuration = secs + 's';
      requestAnimationFrame(() => { $('ovCircle').style.transform = 'scale(' + curScale + ')'; });
    }
    guideTone(type, secs); speakCue(type); vibe(type === 'in' ? 60 : type === 'out' ? 40 : 25);
  }

  breath = setInterval(() => {
    remaining--; t--;
    $('ovTime').textContent = fmt(Math.max(remaining, 0));
    $('ovCnt').textContent = t > 0 ? t : '';
    if(remaining <= 0){ stopBreathing(true); return; }
    if(t <= 0){
      pi = (pi + 1) % pat.phases.length;
      const [type, secs] = pat.phases[pi]; t = secs; setPhase(type, secs);
    }
  }, 1000);
  $('ovCnt').textContent = t;
}
function stopBreathing(done){
  clearInterval(breath); breath = null;
  $('ovCircle').style.transitionDuration = '0.6s'; $('ovCircle').style.transform = 'scale(1)';
  $('overlay').classList.remove('show');
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  if(done){ vibe([80, 80, 80]); completionChime(); }
}
$('startBreathe').onclick = startBreathing;
$('palpStartBreathe').onclick = () => { show('breathe'); startBreathing(); };
$('ovStop').onclick = () => stopBreathing(false);

/* ------------------------------------------------------------------ palpitation */
$('palpBtn').onclick = () => show('palp');
$('palpLog').onclick = () => { stopEpisodeTimer(); show('log'); };

const PALP_REDFLAGS = [
  ['chestpain','Chest pain or pressure'],
  ['breathless','Short of breath'],
  ['fainted','Fainting or near-fainting'],
  ['dizzy','Severe dizziness'],
  ['wontsettle',"Won't settle / feels wrong"],
];
function renderPalpChecks(){
  $('palpRedflags').innerHTML = PALP_REDFLAGS.map(([k, t]) =>
    `<label class="chk"><input type="checkbox" data-palpflag="${k}"><span>${t}</span></label>`).join('');
  const inputs = [...$('palpRedflags').querySelectorAll('input')];
  inputs.forEach(i => i.onchange = () => {
    const checked = inputs.filter(x => x.checked).map(x => x.dataset.palpflag);
    const res = escalationLevel({ flags: checked });
    renderAlert($('palpEscalate'), res);
    if(res.level !== 'log') vibe(30);
  });
  renderAlert($('palpEscalate'), null);
}

/* ------------------------------------------------------------------ episode timer
   Capturing exact onset→settle duration is the single most useful field for a
   cardiologist; the manual buckets are a fallback. The timer pre-fills the
   matching bucket when the episode is logged. */
let episode = { startedAt:null, endedAt:null, durationSec:null };
let episodeTick = null;
function updateTimerDisplay(){
  if(episode.startedAt == null) return;
  $('timerDisplay').textContent = fmt(Math.floor((Date.now() - episode.startedAt) / 1000));
}
function startEpisodeTimer(){
  episode = { startedAt:Date.now(), endedAt:null, durationSec:null };
  $('timerDisplay').classList.remove('hidden'); $('timerDisplay').classList.add('running');
  $('timerDone').classList.add('hidden');
  $('timerStart').classList.add('hidden');
  $('timerStop').classList.remove('hidden');
  updateTimerDisplay();
  episodeTick = setInterval(updateTimerDisplay, 1000);
  vibe(30);
}
function stopEpisodeTimer(){
  if(episode.startedAt == null || episode.endedAt != null) return;
  clearInterval(episodeTick); episodeTick = null;
  episode.endedAt = Date.now();
  episode.durationSec = Math.max(1, Math.round((episode.endedAt - episode.startedAt) / 1000));
  $('timerDisplay').classList.remove('running');
  $('timerDisplay').textContent = fmt(episode.durationSec);
  $('timerStop').classList.add('hidden');
  $('timerStart').classList.remove('hidden'); $('timerStart').textContent = '▶  Time another';
  $('timerDone').classList.remove('hidden');
  $('timerDone').textContent = `Lasted ${fmt(episode.durationSec)} — this fills in the duration when you log it.`;
  vibe(40);
}
function resetTimerUI(){
  if(episodeTick){ clearInterval(episodeTick); episodeTick = null; }
  episode = { startedAt:null, endedAt:null, durationSec:null };
  $('timerDisplay').classList.add('hidden'); $('timerDisplay').classList.remove('running');
  $('timerDisplay').textContent = '0:00';
  $('timerStart').classList.remove('hidden'); $('timerStart').textContent = '▶  Start timing';
  $('timerStop').classList.add('hidden');
  $('timerDone').classList.add('hidden');
}
$('timerStart').onclick = startEpisodeTimer;
$('timerStop').onclick = stopEpisodeTimer;

/* ------------------------------------------------------------------ quick log (Stage 1)
   Fast, minimal-typing basics. Symptom detail moves to Stage 2 (detail form). */
const draft = { rhythmFeel:'', duration:'', breathingResponse:'' };
const multi = { sensation:{}, episodeContext:{} };  // chip maps -> arrays
function multiVals(name){ return Object.keys(multi[name]).filter(k => multi[name][k]); }
function checkEscalation(){
  const res = escalationLevel({
    rhythmFeel: draft.rhythmFeel,
    duration: draft.duration,
    episodeContext: multiVals('episodeContext'),
  });
  renderAlert($('redflagAlert'), res);
}
// multi-select chip groups (Stage 1: sensation, episodeContext)
document.querySelectorAll('#logForm [data-multi]').forEach(group => {
  const name = group.dataset.multi;
  group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const v = btn.dataset.val;
    multi[name][v] = !multi[name][v];
    btn.classList.toggle('on', multi[name][v]);
    if(name === 'episodeContext') checkEscalation();
  });
});
// single-select segmented groups (Stage 1 only: data-seg)
document.querySelectorAll('.seg[data-seg]').forEach(group => {
  const name = group.dataset.seg;
  group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const val = btn.dataset.val;
    draft[name] = (draft[name] === val) ? '' : val; // tap again to clear
    group.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.val === draft[name]));
    if(['rhythmFeel','duration'].includes(name)) checkEscalation();
  });
});
function clearStage1(){
  draft.rhythmFeel = draft.duration = draft.breathingResponse = '';
  multi.sensation = {}; multi.episodeContext = {};
  document.querySelectorAll('#logForm .seg button, #logForm .chips .btn').forEach(b => b.classList.remove('on'));
}
function stampLog(){
  const d = new Date();
  $('logStamp').textContent = 'Started: ' + d.toLocaleString([], {weekday:'short', hour:'2-digit', minute:'2-digit', day:'numeric', month:'short'});
  // pre-fill the duration bucket from a just-timed episode (unless already set)
  if(episode.durationSec != null && !draft.duration){
    draft.duration = bucketForDuration(episode.durationSec);
    const seg = document.querySelector('.seg[data-seg="duration"]');
    if(seg) seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.val === draft.duration));
    checkEscalation();
  }
}
let lastSavedTs = null;
$('saveLog').onclick = () => {
  const entry = normalizeEntry({
    ts: Date.now(),
    sensation: multiVals('sensation'),
    rhythmFeel: draft.rhythmFeel,
    episodeContext: multiVals('episodeContext'),
    breathingResponse: draft.breathingResponse,
    duration: draft.duration,
    durationSec: episode.durationSec ?? '',
    startedAt: episode.startedAt ?? null,
    endedAt: episode.endedAt ?? null,
    pulse: $('logPulse').value || '',
    pulseAfter: $('logPulseAfter').value || '',
    activity: $('logActivity').value.trim(),
    note: $('logNote').value.trim(),
  });
  state.logs.unshift(entry); save();
  lastSavedTs = entry.ts;
  clearStage1();
  $('logPulse').value = $('logPulseAfter').value = $('logActivity').value = $('logNote').value = '';
  renderAlert($('redflagAlert'), null);
  resetTimerUI();
  pulseTaps = []; renderTapState();
  renderLogs(); show('log'); openCalmHandoff();
};

/* ------------------------------------------------------------------ detail form (Stage 2)
   Optional richer clinical context, added to one saved episode when settled.
   Medication/substance context is recorded, never advised on. */
const MED_SEGS = ['relieverUsed','relieverType','relieverTime','preventer','coldflu','decongestant','adhd','antidepressantChange'];
const MED_YES = ['caffeine','alcohol','nicotine','supplement','newMed'];
let detailTargetTs = null;
const dform = {};   // data-dseg single-selects
const dassoc = {};  // associatedSymptoms multi
const dyes = {};    // caffeine/alcohol/... yes toggles

document.querySelectorAll('.seg[data-dseg]').forEach(group => {
  const name = group.dataset.dseg;
  group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    dform[name] = (dform[name] === btn.dataset.val) ? '' : btn.dataset.val;
    group.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.val === dform[name]));
  });
});
document.querySelectorAll('[data-dmulti]').forEach(group => {
  group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const v = btn.dataset.val;
    dassoc[v] = !dassoc[v];
    btn.classList.toggle('on', dassoc[v]);
    const active = Object.keys(dassoc).filter(k => dassoc[k]);
    renderAlert($('detailEscalate'), escalationLevel({ flags: active }));
  });
});
document.querySelectorAll('[data-yes]').forEach(btn => btn.onclick = () => {
  const k = btn.dataset.yes; dyes[k] = !dyes[k]; btn.classList.toggle('on', dyes[k]);
});
function setDseg(name, val){
  dform[name] = val || '';
  const g = document.querySelector(`.seg[data-dseg="${name}"]`);
  if(g) g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.val === dform[name]));
}
function clearDetailForm(){
  Object.keys(dform).forEach(k => delete dform[k]);
  Object.keys(dassoc).forEach(k => delete dassoc[k]);
  Object.keys(dyes).forEach(k => delete dyes[k]);
  document.querySelectorAll('#detailForm .seg button, #detailForm .chips .btn').forEach(b => b.classList.remove('on'));
  $('dStressBefore').value = $('dStressDuring').value = '';
  renderAlert($('detailEscalate'), null);
}
function openDetailForm(ts){
  const e = state.logs.find(x => x.ts === ts);
  if(!e){ toast('Episode not found'); return; }
  detailTargetTs = ts;
  clearDetailForm();
  setDseg('onset', e.onset); setDseg('offset', e.offset);
  const mc = e.medicationContext || {}, sc = e.stressContext || {};
  MED_SEGS.forEach(k => setDseg(k, mc[k]));
  MED_YES.forEach(k => {
    dyes[k] = mc[k] === 'yes';
    const b = document.querySelector(`[data-yes="${k}"]`); if(b) b.classList.toggle('on', dyes[k]);
  });
  $('dStressBefore').value = sc.stressBefore ?? '';
  $('dStressDuring').value = sc.stressDuring ?? '';
  setDseg('panicAfter', sc.panicAfter); setDseg('emotionalStress', sc.emotionalStress);
  (e.associatedSymptoms || []).forEach(v => {
    dassoc[v] = true;
    const b = document.querySelector(`[data-dmulti] [data-val="${v}"]`); if(b) b.classList.add('on');
  });
  renderAlert($('detailEscalate'), escalationLevel({ flags: (e.associatedSymptoms || []) }));
  $('detailFor').textContent = 'For episode on ' + new Date(ts).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  $('detailForm').classList.remove('hidden');
  $('detailForm').scrollIntoView({ behavior:'smooth', block:'start' });
}
$('detailCancel').onclick = () => { $('detailForm').classList.add('hidden'); detailTargetTs = null; };
$('saveDetail').onclick = () => {
  const e = state.logs.find(x => x.ts === detailTargetTs);
  if(!e){ $('detailForm').classList.add('hidden'); return; }
  e.onset = dform.onset || '';
  e.offset = dform.offset || '';
  e.associatedSymptoms = Object.keys(dassoc).filter(k => dassoc[k]);
  const mc = {};
  MED_SEGS.forEach(k => { if(dform[k]) mc[k] = dform[k]; });
  MED_YES.forEach(k => { if(dyes[k]) mc[k] = 'yes'; });
  e.medicationContext = mc;
  const sc = {};
  if($('dStressBefore').value !== '') sc.stressBefore = $('dStressBefore').value;
  if($('dStressDuring').value !== '') sc.stressDuring = $('dStressDuring').value;
  if(dform.panicAfter) sc.panicAfter = dform.panicAfter;
  if(dform.emotionalStress) sc.emotionalStress = dform.emotionalStress;
  e.stressContext = sc;
  e.detailAddedAt = Date.now();
  e.schemaVersion = SCHEMA_VERSION;
  save();
  $('detailForm').classList.add('hidden'); detailTargetTs = null;
  renderLogs(); toast('Details added');
};
function renderLogs(){
  const logList = $('logList');
  if(!state.logs.length){ logList.innerHTML = '<p class="dim">No episodes logged yet.</p>'; return; }
  logList.innerHTML = state.logs.map((e) => {
    const d = new Date(e.ts);
    const when = d.toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    const tags = entrySymptoms(e).map(f => `<span class="tag ${RED.includes(f) ? 'flag' : ''}">${escHtml(FLAG_LABEL[f] || f)}</span>`).join('');
    const extra = [];
    if(e.sensation && e.sensation.length) extra.push(escHtml(e.sensation.join(', ')));
    if(e.duration) extra.push(escHtml(e.duration) + (e.durationSec ? ` (${fmt(e.durationSec)})` : ''));
    const rhythm = e.rhythmFeel || e.rhythm; if(rhythm) extra.push(escHtml(rhythm));
    if(e.onset || e.offset) extra.push(escHtml([e.onset, e.offset].filter(Boolean).join('→')));
    const ctx = (e.episodeContext && e.episodeContext.length) ? e.episodeContext.join(', ') : e.context;
    if(ctx) extra.push(escHtml(ctx));
    if(e.pulse) extra.push('Pulse ' + escHtml(e.pulse) + (e.pulseAfter ? '→' + escHtml(e.pulseAfter) : ''));
    const breath = e.breathingResponse || e.helped; if(breath) extra.push('breathing ' + escHtml(breath));
    if(entryReliever(e)) extra.push('reliever near');
    const sc = e.stressContext || {};
    const stressShown = sc.stressDuring ?? sc.stressBefore ?? ((e.stress !== '' && e.stress != null) ? e.stress : null);
    if(stressShown != null && stressShown !== '') extra.push('Stress ' + escHtml(stressShown) + '/10');
    if(e.triggers) extra.push(escHtml(e.triggers));
    const detailBtn = e.detailAddedAt
      ? `<button class="btn sm" data-detail="${e.ts}" style="flex:0 0 auto">Details ✓</button>`
      : `<button class="btn sm" data-detail="${e.ts}" style="flex:0 0 auto">+ details</button>`;
    return `<div class="logitem"><div class="row" style="align-items:flex-start">
        <div class="when" style="flex:1">${when}</div>
        ${detailBtn}
        <button class="btn sm" data-dellog="${e.ts}" style="flex:0 0 36px" aria-label="Delete this entry">✕</button>
      </div>
      <div>${tags || '<span class="dim">no symptoms ticked</span>'}</div>
      ${extra.length ? `<div class="dim" style="font-size:.85rem;margin-top:4px">${extra.join(' · ')}</div>` : ''}
      ${e.activity ? `<div class="dim" style="font-size:.85rem;margin-top:2px">Before: ${escHtml(e.activity)}</div>` : ''}
      ${e.note ? `<div style="margin-top:4px">${escHtml(e.note)}</div>` : ''}</div>`;
  }).join('');
  logList.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openDetailForm(Number(b.dataset.detail)));
  logList.querySelectorAll('[data-dellog]').forEach(b => b.onclick = () => {
    if(!confirm('Delete this entry?')) return;
    const ts = Number(b.dataset.dellog);
    state.logs = state.logs.filter(x => x.ts !== ts); save(); renderLogs();
  });
}
$('copyLog').onclick = () => copy(logsToText(state.logs, FLAG_LABEL));
$('csvLog').onclick = () => {
  const csv = logsToCSV(state.logs, FLAG_LABEL);
  downloadBlob(csv, 'palpitation-log.csv', 'text/csv');
};

/* ------------------------------------------------------------------ tap-to-count pulse (upgrade #5) */
let pulseTaps = [];
function renderTapState(){
  const btn = $('tapPulse');
  const bpm = bpmFromTaps(pulseTaps);
  if(!pulseTaps.length){
    btn.innerHTML = '<span class="big">— bpm</span>Tap on each heartbeat';
  } else {
    btn.innerHTML = `<span class="big">${bpm ?? '—'} bpm</span>${pulseTaps.length} taps · keep going, tap on each beat`;
  }
}
$('tapPulse').onclick = () => {
  pulseTaps.push(Date.now());
  // keep only the last 20 taps so an old first tap doesn't drag the average
  if(pulseTaps.length > 20) pulseTaps = pulseTaps.slice(-20);
  renderTapState();
  const bpm = bpmFromTaps(pulseTaps);
  if(bpm && pulseTaps.length >= 6) $('logPulse').value = bpm;
  vibe(10);
};
$('tapReset').onclick = () => { pulseTaps = []; $('logPulse').value=''; renderTapState(); };

/* ------------------------------------------------------------------ clipboard / files */
function copy(text){
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(() => toast('Copied'), () => prompt('Copy:', text));
  } else { prompt('Copy:', text); }
}
function toast(msg){
  const t = document.createElement('div'); t.textContent = msg; t.setAttribute('role','status');
  t.style.cssText = 'position:fixed;bottom:130px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--accent-ink);padding:10px 18px;border-radius:999px;z-index:80;font-size:.9rem';
  document.body.appendChild(t); setTimeout(() => t.remove(), 1400);
}
function downloadBlob(content, filename, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ care quick-log */
document.querySelectorAll('[data-care]').forEach(b => b.onclick = () => {
  state.care.unshift({ ts: Date.now(), item: b.dataset.care }); save();
  b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 700);
  toast('Logged: ' + b.dataset.care.split(':')[1]);
});
const HYDRO = [
  { k:'water', t:"I've had water recently" },
  { k:'urine', t:'Urine is not dark' },
  { k:'standing', t:'Not dizzy when standing' },
  { k:'gi', t:'No vomiting / diarrhoea' },
  { k:'sweat', t:'Not sweating heavily' },
  { k:'fever', t:'No fever' },
];
function renderHydro(){
  $('hydroChecks').innerHTML = HYDRO.map(h =>
    `<label class="chk"><input type="checkbox" data-hyd="${h.k}"><span>${h.t}</span></label>`).join('');
  $('hydroChecks').querySelectorAll('input').forEach(i => i.onchange = updateHydro);
}
function updateHydro(){
  const checks = [...$('hydroChecks').querySelectorAll('input')];
  const unchecked = checks.filter(i => !i.checked);
  const msg = $('hydroMsg');
  if(!unchecked.length){
    msg.innerHTML = '<strong>Water only.</strong> No dehydration signs ticked — sip water steadily through the day.';
    return;
  }
  const flagged = unchecked.map(i => i.dataset.hyd);
  const orsSigns = ['urine','standing','gi','sweat','fever'].some(k => flagged.includes(k));
  msg.innerHTML = orsSigns
    ? '<strong>Consider oral rehydration.</strong> With fever, sweating, vomiting/diarrhoea, dark urine or light-headedness on standing, a pharmacy oral rehydration solution (Hydralyte etc.) mixed exactly as directed can help. ' +
      'Do <strong>not</strong> use electrolyte drinks as a heart treatment, and do not start potassium supplements or salt substitutes unless a clinician advises it.'
    : '<strong>Top up with water.</strong> Have a drink now and keep sipping. If fever, vomiting, dark urine or dizziness-on-standing appear, switch to oral rehydration solution.';
}

/* ------------------------------------------------------------------ today plan */
function renderToday(){
  const blocks = [
    ['Morning', ['Drink water','Eat something','5 min 4–6 breathing']],
    ['Work', ['Keep water bottle visible','Midday 5 min breathing','Gentle 10-min walk if well','Eat if it has been too long']],
    ['Afternoon', ['Oral rehydration only if dehydration signs are present']],
    ['Evening', ['Light dinner','No lying down for 3h after eating','5 min breathing before bed','Log symptoms']],
  ];
  $('todayPlan').innerHTML = blocks.map(([h, items]) =>
    `<h3 style="margin-top:10px">${h}</h3><ul style="margin:0;padding-left:18px;font-size:.92rem">${items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('');
}

/* ------------------------------------------------------------------ reminders */
function renderReminders(){
  const list = $('reminderList');
  list.innerHTML = state.reminders.map(r => `
    <div class="row" style="align-items:center;margin-bottom:8px">
      <input type="time" value="${escHtml(r.time)}" data-rid="${r.id}" data-f="time" style="flex:0 0 110px" aria-label="Reminder time">
      <input type="text" value="${escHtml(r.label)}" data-rid="${r.id}" data-f="label" aria-label="Reminder label">
      <button class="btn sm ${r.on ? 'on' : ''}" data-toggle="${r.id}" style="flex:0 0 60px">${r.on ? 'On' : 'Off'}</button>
      <button class="btn sm" data-del="${r.id}" style="flex:0 0 40px" aria-label="Delete reminder">✕</button>
    </div>`).join('');
  list.querySelectorAll('input').forEach(i => i.onchange = () => {
    const r = state.reminders.find(x => x.id === i.dataset.rid); if(r){ r[i.dataset.f] = i.value; save(); }
  });
  list.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    const r = state.reminders.find(x => x.id === b.dataset.toggle); if(r){ r.on = !r.on; save(); renderReminders(); }
  });
  list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    state.reminders = state.reminders.filter(x => x.id !== b.dataset.del); save(); renderReminders();
  });
}
$('addReminder').onclick = () => {
  state.reminders.push({ id: 'r' + Date.now(), time: '12:00', label: 'Breathing round + water', on: true });
  save(); renderReminders();
};
$('notifBtn').onclick = async () => {
  if(!('Notification' in window)){ toast('Notifications not supported'); return; }
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Notifications on' : 'Using in-page banner');
  if(p === 'granted') registerPeriodicReminders();
};
/* Best-effort background reminders via the service worker (upgrade #4).
   Periodic Background Sync is only available on some Chromium browsers and
   requires an installed PWA; we register it when we can and always keep the
   in-page ticker as the reliable fallback. */
async function registerPeriodicReminders(){
  try{
    const reg = await navigator.serviceWorker?.ready;
    if(reg && 'periodicSync' in reg){
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if(status.state === 'granted'){
        await reg.periodicSync.register('calm-reminders', { minInterval: 15 * 60 * 1000 });
      }
    }
  }catch(e){ /* fallback: in-page ticker below */ }
}
let lastFired = {};
function checkReminders(){
  const d = new Date();
  const hhmm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const key = d.toDateString() + hhmm;
  state.reminders.forEach(r => {
    if(r.on && r.time === hhmm && lastFired[r.id] !== key){
      lastFired[r.id] = key;
      const msg = r.label + ' — and a quiet sip of water.';
      if('Notification' in window && Notification.permission === 'granted'){
        try{ new Notification('Calm', { body: msg, tag: r.id }); }catch(e){ showBanner(msg); }
      } else { showBanner(msg); }
    }
  });
}
function showBanner(msg){ $('reminderText').textContent = msg; $('reminderBanner').classList.remove('hidden'); }
$('icsExport').onclick = () => {
  const on = state.reminders.filter(r => r.on);
  if(!on.length){ toast('No active reminders'); return; }
  const d = new Date();
  const dt = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  downloadBlob(icsForReminders(state.reminders, dt), 'calm-reminders.ics', 'text/calendar');
  toast('Calendar file saved — open it to add the reminders');
};
/* Install prompt — make it a real installable PWA so reminders can run. */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  const b = $('installBtn'); if(b) b.style.display = '';
});
$('installBtn').onclick = async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $('installBtn').style.display = 'none';
};
$('reminderDismiss').onclick = () => $('reminderBanner').classList.add('hidden');
setInterval(checkReminders, 20000);

/* ------------------------------------------------------------------ GP prep + trends */
function stats(){ return gpStats(state.logs, state.care, RED, Date.now()); }
function renderPrep(){
  const a = stats();
  const days = Object.entries(a.byDay).map(([d, n]) => `${d}: ${n}`).join('<br>') || 'none';
  const trig = a.triggers.length ? a.triggers.map(t => `${t.trigger} (${t.count})`).join(', ') : 'none recorded';
  $('prepSummary').innerHTML = `
    <div class="dim" style="font-size:.9rem">
    <b>Total episodes:</b> ${a.total} · <b>last 7 days:</b> ${a.last7}<br>
    <b>Irregular rhythm:</b> ${a.irregular} · <b>on exertion:</b> ${a.onExertion}<br>
    <b>Red-flag symptom:</b> ${a.withRed} · <b>with cough:</b> ${a.withCough} · <b>Ventolin &lt;4h:</b> ${a.ventolinRecent}<br>
    <b>Breathing helped:</b> ${a.helped} · <b>avg pulse:</b> ${a.avgPulse != null ? Math.round(a.avgPulse) : '—'} · <b>avg stress:</b> ${a.avgStress != null ? a.avgStress.toFixed(1) : '—'}/10<br>
    <b>Top triggers:</b> ${trig}<br>
    <b>By day:</b><br>${days}
    </div>`;
}
function prepText(){
  const a = stats();
  const careLines = state.care.slice(0, 40).map(c => '  • ' + new Date(c.ts).toLocaleString() + ' — ' + c.item.split(':').slice(1).join(':')).join('\n');
  return `GP / cardiology prep summary
============================
Total palpitation episodes: ${a.total} (last 7 days: ${a.last7})
Episodes with irregular rhythm: ${a.irregular}
Episodes on exertion: ${a.onExertion}
Episodes with a red-flag symptom (chest pain / breathless / faint): ${a.withRed}
Episodes with cough: ${a.withCough}
Episodes with Ventolin/reliever in prior 4h: ${a.ventolinRecent}
Breathing reported as helping: ${a.helped}
Average pulse (where recorded): ${a.avgPulse != null ? Math.round(a.avgPulse) : 'n/a'}
Average stress: ${a.avgStress != null ? a.avgStress.toFixed(1) + '/10' : 'n/a'}
Most common triggers: ${a.triggers.map(t => t.trigger + ' (' + t.count + ')').join(', ') || 'none recorded'}

${logsToText(state.logs, FLAG_LABEL)}

Care / trigger log (recent)
${careLines || '  none'}

Questions to ask
  • 12-lead ECG?
  • Bloods: FBC, electrolytes (incl. magnesium/calcium), kidney function, thyroid, iron/ferritin?
  • Repeat/bring forward Holter or event monitoring?
  • Could asthma, reflux, viral illness, medication, thyroid, anaemia or electrolytes contribute?
  • Any reason to bring cardiology forward?`;
}
$('copyPrep').onclick = () => copy(prepText());
$('copyReception').onclick = () => {
  const a = stats();
  copy(`Hi, I'd like to book an appointment about ongoing heart palpitations. ` +
    `I've logged ${a.total} episode${a.total === 1 ? '' : 's'}${a.last7 ? ` (${a.last7} in the last 7 days)` : ''}` +
    `${a.withRed ? `, ${a.withRed} with symptoms like chest pain/breathlessness/faintness` : ''}. ` +
    `I have a symptom diary I can bring or send. Could I please see a GP about this and discuss whether an ECG or Holter monitor is needed? Thank you.`);
};
$('printPrep').onclick = () => {
  $('printArea').innerHTML = `<h1>Calm — GP / cardiology prep</h1>
    <p>Generated ${new Date().toLocaleString()}</p>
    <pre>${escHtml(prepText())}</pre>`;
  window.print();
};

/* Inline SVG trend chart — no external library (upgrade #1). */
function barChart(data){
  const h = 120, pad = 18;
  const w = Math.max(data.length * 26, 240);
  const max = Math.max(1, ...data.map(d => d.count));
  const slot = (w - pad * 2) / data.length;
  const bw = Math.max(6, slot - 6);
  let bars = '';
  data.forEach((d, i) => {
    const x = pad + i * slot;
    const bh = (d.count / max) * (h - pad * 2);
    const y = h - pad - bh;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(bh,0).toFixed(1)}" rx="2" fill="var(--accent)"></rect>`;
    if(d.count) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="9" text-anchor="middle" fill="var(--ink-dim)">${d.count}</text>`;
    if(i % 2 === 0) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 5}" font-size="8" text-anchor="middle" fill="var(--ink-dim)">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Episodes per day, last ${data.length} days">${bars}<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line)"/></svg>`;
}
function renderTrends(){
  $('trendsGuard').textContent = CALM_COPY.trends;
  const wrap = $('trends');
  if(!state.logs.length){ wrap.innerHTML = '<p class="dim">Log a few episodes to see trends here.</p>'; return; }
  const data = dailyCounts(state.logs, 14, Date.now());
  const avgPulse = average(state.logs.map(e => e.pulse));
  const avgStress = average(state.logs.map(e => e.stress));
  const last7 = data.slice(-7).reduce((s, d) => s + d.count, 0);
  wrap.innerHTML = `
    <div class="chartwrap">${barChart(data)}</div>
    <div class="stat-row">
      <div class="stat"><div class="v">${last7}</div><div class="k">episodes · last 7 days</div></div>
      <div class="stat"><div class="v">${avgPulse != null ? Math.round(avgPulse) : '—'}</div><div class="k">avg pulse (bpm)</div></div>
      <div class="stat"><div class="v">${avgStress != null ? avgStress.toFixed(1) : '—'}</div><div class="k">avg stress /10</div></div>
    </div>`;
}

/* ------------------------------------------------------------------ custom patterns (upgrade #6) */
function renderCustomPatterns(){
  const wrap = $('customPatterns');
  const custom = state.settings.patterns || [];
  wrap.innerHTML = (custom.length ? custom.map(p =>
    `<div class="row" style="align-items:center;margin-bottom:8px">
      <span style="flex:1">${escHtml(p.name)} <span class="dim">(${escHtml(phasesToString(p.phases))})</span></span>
      <button class="btn sm" data-delpat="${escHtml(p.id)}" style="flex:0 0 40px" aria-label="Delete pattern">✕</button>
    </div>`).join('') : '<p class="dim" style="font-size:.85rem">No custom patterns yet.</p>');
  wrap.querySelectorAll('[data-delpat]').forEach(b => b.onclick = () => {
    state.settings.patterns = (state.settings.patterns || []).filter(p => p.id !== b.dataset.delpat);
    if(!allPatterns()[state.settings.pattern]) state.settings.pattern = '46';
    save(); renderCustomPatterns(); syncBreatheButtons();
  });
}
$('addPattern').onclick = () => {
  const name = $('patName').value.trim();
  const phases = parsePattern($('patPhases').value);
  if(!name){ toast('Name the pattern'); return; }
  if(!phases){ toast('Use e.g. in:4, hold:4, out:6'); return; }
  state.settings.patterns = state.settings.patterns || [];
  state.settings.patterns.push({ id: 'p' + Date.now(), name, phases });
  $('patName').value = ''; $('patPhases').value = '';
  save(); renderCustomPatterns(); syncBreatheButtons(); toast('Pattern added');
};

/* ------------------------------------------------------------------ emergency info (upgrade #8) */
const EMERG_FIELDS = [
  ['conditions','Conditions'], ['meds','Current medications'], ['allergies','Allergies'],
  ['contactName','Emergency contact name'], ['contactPhone','Emergency contact phone'], ['notes','Other notes'],
];
function renderEmergencyForm(){
  $('emergForm').innerHTML = EMERG_FIELDS.map(([k, label]) => {
    const v = escHtml(state.emergency[k] || '');
    const input = k === 'contactPhone'
      ? `<input type="tel" data-emerg="${k}" value="${v}">`
      : (k === 'notes' || k === 'conditions' || k === 'meds'
        ? `<textarea data-emerg="${k}">${v}</textarea>`
        : `<input type="text" data-emerg="${k}" value="${v}">`);
    return `<div class="field"><label>${label}</label>${input}</div>`;
  }).join('');
  $('emergForm').querySelectorAll('[data-emerg]').forEach(i => i.oninput = () => {
    state.emergency[i.dataset.emerg] = i.value; save(); renderEmergencyCard();
  });
}
function renderEmergencyCard(){
  const e = state.emergency;
  const has = Object.values(e).some(v => v && v.trim());
  const box = $('emergCard');
  if(!has){ box.innerHTML = '<p class="dim" style="font-size:.85rem">Add your emergency info in More → Emergency info so it is here when you need it.</p>'; return; }
  const rows = [];
  if(e.conditions) rows.push(`<b>Conditions:</b> ${escHtml(e.conditions)}`);
  if(e.meds) rows.push(`<b>Meds:</b> ${escHtml(e.meds)}`);
  if(e.allergies) rows.push(`<b>Allergies:</b> ${escHtml(e.allergies)}`);
  if(e.contactName || e.contactPhone) rows.push(`<b>Contact:</b> ${escHtml(e.contactName)} ${e.contactPhone ? `<a href="tel:${escHtml(e.contactPhone)}" style="color:inherit">${escHtml(e.contactPhone)}</a>` : ''}`);
  if(e.notes) rows.push(`<b>Notes:</b> ${escHtml(e.notes)}`);
  box.innerHTML = `<div class="emerg">${rows.join('<br>')}</div>`;
}

/* ------------------------------------------------------------------ resources */
function renderRes(){
  $('resList').innerHTML = RESOURCES.map(r =>
    `<a class="res" href="${escHtml(r.url)}" target="_blank" rel="noopener">${escHtml(r.title)}<small class="dim">${escHtml(r.note)}</small></a>`).join('');
}

/* ------------------------------------------------------------------ export / import (upgrades #2 & #10) */
function bundle(){
  return { app:'heart-calm', v:1, exportedAt:new Date().toISOString(),
    logs:state.logs, care:state.care, reminders:state.reminders,
    settings:state.settings, emergency:state.emergency };
}
function applyBundle(b){
  if(!b || b.app !== 'heart-calm') throw new Error('Not a Calm backup file');
  state.logs = Array.isArray(b.logs) ? b.logs : state.logs;
  state.care = Array.isArray(b.care) ? b.care : state.care;
  state.reminders = Array.isArray(b.reminders) ? b.reminders : state.reminders;
  state.settings = Object.assign({}, DEFAULT_SETTINGS, b.settings || {});
  state.emergency = Object.assign({}, DEFAULT_EMERGENCY, b.emergency || {});
  save();
  applyTheme(); renderAll();
}
$('exportData').onclick = () => {
  downloadBlob(JSON.stringify(bundle(), null, 2), 'calm-backup.json', 'application/json');
};
$('importData').onclick = () => $('importFile').click();
$('importFile').onchange = async (ev) => {
  const file = ev.target.files[0]; if(!file) return;
  try{
    const text = await file.text();
    let data = JSON.parse(text);
    if(data.enc){
      const pass = prompt('This backup is encrypted. Enter the passphrase:');
      if(pass == null) return;
      data = await decryptData(data, pass);
    }
    if(!confirm('Replace all current data with this backup?')) return;
    applyBundle(data); toast('Backup restored');
  }catch(e){ toast('Could not import: ' + (e.message || 'bad file')); }
  finally{ ev.target.value = ''; }
};

/* Encrypted backup — passphrase-derived AES-GCM via Web Crypto (upgrade #10).
   This is the privacy-preserving core of optional sync: data is encrypted
   client-side before it ever leaves the device. Full multi-device sync would
   add a storage backend; the encrypted file already enables safe transfer. */
const b64 = u8 => btoa(String.fromCharCode(...u8));
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass, salt){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:150000, hash:'SHA-256' },
    km, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptData(obj, pass){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { app:'heart-calm', enc:true, v:1, salt:b64(salt), iv:b64(iv), ct:b64(new Uint8Array(ct)) };
}
async function decryptData(blobObj, pass){
  const key = await deriveKey(pass, ub64(blobObj.salt));
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:ub64(blobObj.iv) }, key, ub64(blobObj.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
$('exportEnc').onclick = async () => {
  if(!crypto.subtle){ toast('Encryption not available here'); return; }
  const pass = prompt('Choose a passphrase for this encrypted backup.\nYou will need it to restore — it cannot be recovered.');
  if(!pass){ return; }
  try{
    const enc = await encryptData(bundle(), pass);
    downloadBlob(JSON.stringify(enc, null, 2), 'calm-backup.enc.json', 'application/json');
    toast('Encrypted backup saved');
  }catch(e){ toast('Encryption failed'); }
};

/* ------------------------------------------------------------------ clear data */
$('clearData').onclick = () => {
  if(confirm('Delete all logs, reminders, settings and emergency info on this device? This cannot be undone.')){
    const theme = state.settings.theme;
    localStorage.clear();
    state.logs = []; state.care = [];
    state.reminders = JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
    state.settings = Object.assign({}, DEFAULT_SETTINGS, { theme, onboarded:true });
    state.emergency = Object.assign({}, DEFAULT_EMERGENCY);
    save(); renderAll(); toast('Cleared');
  }
};

/* ------------------------------------------------------------------ onboarding (upgrade #8) */
function maybeOnboard(){
  if(state.settings.onboarded) return;
  $('onboard').classList.add('show');
}
$('onboardClose').onclick = () => {
  state.settings.onboarded = true; save();
  $('onboard').classList.remove('show');
};

/* ------------------------------------------------------------------ i18n scaffold (upgrade #7)
   Minimal string table + t(). English only for now; structure lets a
   translator add locales without touching logic. Most static copy lives in
   index.html; dynamic strings funnel through here over time. */
const STRINGS = { en: { copied:'Copied', saved:'Episode saved', cleared:'Cleared' } };
const LANG = (navigator.language || 'en').slice(0, 2);
export function t(key){ return (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key; }

/* ------------------------------------------------------------------ init */
function renderAll(){
  renderToday(); renderLogs(); renderReminders(); renderRes(); renderHydro();
  renderTrends(); renderCustomPatterns(); renderEmergencyForm(); renderEmergencyCard();
  syncBreatheButtons(); stampLog(); renderTapState(); applyDim();
}
state.logs = normalizeLogs(state.logs); save(); // migrate old entries to the current schema
renderAll();
maybeOnboard();
recordOpenAndMaybeGuard();

/* PWA — register service worker for offline / installability */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
