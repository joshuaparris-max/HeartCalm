/* =========================================================================
   pure.js — side-effect-free helpers.
   Imported by app.js (browser) and tests/pure.test.mjs (node --test).
   Keep everything here deterministic and DOM-free so it can be unit tested.
   ========================================================================= */

export function pad2(n){ return String(n).padStart(2, '0'); }

export function fmt(s){
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), x = s % 60;
  return m + ':' + pad2(x);
}

/* Escape for safe HTML insertion — includes quotes so it is safe inside
   attribute values too (the old esc() did not, which broke reminder labels
   containing a double-quote). */
export function escHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* Medication/reliever context as a readable line — recorded near the episode,
   never asserted as a cause. */
function medContextText(mc, e){
  mc = mc || {};
  const parts = [];
  if(mc.relieverUsed){
    parts.push('reliever used: ' + mc.relieverUsed +
      (mc.relieverType ? ` (${mc.relieverType})` : '') +
      (mc.relieverTime ? `, ${mc.relieverTime}` : ''));
  } else if(e && e.ventolinRecent){
    parts.push('reliever in last 4h: yes');
  }
  const other = medContextSummary(mc);
  if(other) parts.push(other);
  return parts.join('; ');
}
function stressContextText(sc, e){
  sc = sc || {};
  const parts = [];
  const has = v => v !== undefined && v !== '' && v != null;
  if(has(sc.stressBefore)) parts.push('before ' + sc.stressBefore + '/10');
  if(has(sc.stressDuring)) parts.push('during ' + sc.stressDuring + '/10');
  if(sc.panicAfter) parts.push('panic/fear started after the palpitation: ' + sc.panicAfter);
  if(sc.emotionalStress) parts.push('emotional stress/conflict nearby: ' + sc.emotionalStress);
  if(!parts.length && e && has(e.stress)) parts.push(e.stress + '/10');
  return parts.join('; ');
}

export function logsToText(logs, FLAG_LABEL){
  if(!logs.length) return 'No episodes logged.';
  const label = f => (FLAG_LABEL && FLAG_LABEL[f]) || f;
  return 'Palpitation log\n===============\n' + logs.map(e => {
    const d = new Date(e.ts).toLocaleString();
    const sym = entrySymptoms(e);
    let s = '• ' + d;
    if(sym.length) s += '\n  Symptoms: ' + sym.map(label).join(', ');
    if(e.sensation && e.sensation.length) s += '\n  Sensation: ' + e.sensation.join(', ');
    if(e.duration) s += '\n  Duration: ' + e.duration + (e.durationSec ? ` (timed: ${fmt(e.durationSec)})` : '');
    const rhythm = e.rhythmFeel || e.rhythm;
    if(rhythm) s += '\n  Rhythm feel: ' + rhythm;
    if(e.onset) s += '\n  Onset: ' + e.onset;
    if(e.offset) s += '\n  Offset: ' + e.offset;
    const ctx = (e.episodeContext && e.episodeContext.length) ? e.episodeContext.join(', ') : e.context;
    if(ctx) s += '\n  Context: ' + ctx;
    if(e.activity) s += '\n  Doing before: ' + e.activity;
    if(e.pulse) s += '\n  Pulse before: ' + e.pulse;
    if(e.pulseAfter) s += '\n  Pulse after: ' + e.pulseAfter;
    const breath = e.breathingResponse || e.helped;
    if(breath) s += '\n  Breathing response: ' + breath;
    if(e.coughTiming && e.coughTiming !== 'none') s += '\n  Cough timing: ' + e.coughTiming;
    const med = medContextText(e.medicationContext, e);
    if(med) s += '\n  Medication/reliever context (recorded near episode, not a cause): ' + med;
    const stress = stressContextText(e.stressContext, e);
    if(stress) s += '\n  Stress context (recorded near episode): ' + stress;
    if(e.triggers) s += '\n  Triggers (recorded near episode): ' + e.triggers;
    if(e.note) s += '\n  Note: ' + e.note;
    return s;
  }).join('\n');
}

export const CSV_HEAD = ['timestamp','symptoms','duration','duration_sec','rhythm','context',
  'pulse_before','pulse_after','activity','breathing_helped','cough_timing',
  'ventolin_recent','stress','triggers','note',
  // Stage 1 (two-stage diary) + Stage 2 detail
  'sensation','rhythm_feel','episode_context','breathing_response','onset','offset',
  'associated_symptoms','reliever_used','reliever_type','reliever_time','medication_context',
  'stress_before','stress_during','panic_after','emotional_stress','detail_added_at','schema_version'];

/* Other (non-reliever) medication/substance context, "key=value" joined. */
const MED_OTHER = ['preventer','coldflu','decongestant','adhd','antidepressantChange',
  'caffeine','alcohol','nicotine','supplement','newMed'];
function medContextSummary(mc){
  if(!mc) return '';
  return MED_OTHER.filter(k => mc[k] && mc[k] !== 'no' && mc[k] !== 'not applicable')
    .map(k => `${k}=${mc[k]}`).join('; ');
}
function symptomList(e, FLAG_LABEL){
  return entrySymptoms(e).map(f => (FLAG_LABEL && FLAG_LABEL[f]) || f).join('; ');
}

export function logsToCSV(logs, FLAG_LABEL){
  const rows = logs.map(e => {
    const mc = e.medicationContext || {}, sc = e.stressContext || {};
    return [
      new Date(e.ts).toISOString(),
      symptomList(e, FLAG_LABEL),
      e.duration ?? '', e.durationSec ?? '', (e.rhythm || e.rhythmFeel) ?? '', e.context ?? '',
      e.pulse ?? '', e.pulseAfter ?? '', e.activity ?? '',
      (e.helped || e.breathingResponse) ?? '', e.coughTiming ?? '', entryReliever(e) ? 'yes' : '',
      e.stress ?? '', e.triggers ?? '',
      String(e.note || '').replace(/\n/g, ' '),
      (e.sensation || []).join('; '), e.rhythmFeel ?? '', (e.episodeContext || []).join('; '),
      e.breathingResponse ?? '', e.onset ?? '', e.offset ?? '',
      (e.associatedSymptoms || []).map(f => (FLAG_LABEL && FLAG_LABEL[f]) || f).join('; '),
      mc.relieverUsed ?? '', mc.relieverType ?? '', mc.relieverTime ?? '', medContextSummary(mc),
      sc.stressBefore ?? '', sc.stressDuring ?? '', sc.panicAfter ?? '', sc.emotionalStress ?? '',
      e.detailAddedAt ? new Date(e.detailAddedAt).toISOString() : '', e.schemaVersion ?? '',
    ];
  });
  return [CSV_HEAD, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function aggregatePrep(logs, care, RED){
  const byDay = {};
  logs.forEach(e => { const k = new Date(e.ts).toLocaleDateString(); byDay[k] = (byDay[k] || 0) + 1; });
  const has = f => logs.filter(e => entrySymptoms(e).includes(f)).length;
  return {
    total: logs.length,
    byDay,
    withCough: logs.filter(e => entrySymptoms(e).includes('cough') || (e.coughTiming && e.coughTiming !== 'none')).length,
    withFlush: has('flushed'),
    withRed: logs.filter(e => entrySymptoms(e).some(f => RED.includes(f))).length,
    withVent: logs.filter(e => entrySymptoms(e).includes('ventolin') || entryReliever(e)).length,
    careCount: care.length,
  };
}

/* Most-common free-text triggers across logs (lower-cased, split on , ; /). */
export function topTriggers(logs, n){
  const counts = {};
  logs.forEach(e => {
    String(e.triggers || '').split(/[,;/]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
      .forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([trigger, count]) => ({ trigger, count }));
}

/* Richer aggregate for the GP summary. nowMs lets the 7-day window be deterministic. */
export function gpStats(logs, care, RED, nowMs){
  const base = aggregatePrep(logs, care, RED);
  const day = 86400000;
  return Object.assign(base, {
    last7: logs.filter(e => e.ts >= nowMs - 7 * day).length,
    avgStress: average(logs.map(e => {
      const sc = e.stressContext || {};
      return e.stress !== '' && e.stress != null ? e.stress : (sc.stressDuring ?? sc.stressBefore);
    })),
    avgPulse: average(logs.map(e => e.pulse)),
    ventolinRecent: logs.filter(entryReliever).length,
    irregular: logs.filter(entryIrregular).length,
    onExertion: logs.filter(entryExertional).length,
    helped: logs.filter(entryHelped).length,
    triggers: topTriggers(logs, 5),
  });
}

/* Build a daily-repeating iCalendar so reminders can live in the user's real
   calendar (which fires reliably even when the app is closed). dtstartDate is
   a 'YYYYMMDD' base day, passed in to keep this deterministic/testable. */
function icsEscape(s){ return String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); }
export function icsForReminders(reminders, dtstartDate){
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calm//Reminders//EN', 'CALSCALE:GREGORIAN'];
  reminders.filter(r => r.on).forEach(r => {
    const [h, m] = String(r.time).split(':');
    const dt = `${dtstartDate}T${h}${m}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@calm.local`,
      `DTSTART:${dt}`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsEscape(r.label)}`,
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(r.label)}`, 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* Estimate bpm from an array of tap timestamps (ms). Needs >= 2 taps. */
export function bpmFromTaps(times){
  if(!times || times.length < 2) return null;
  const intervals = [];
  for(let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if(avg <= 0) return null;
  return Math.round(60000 / avg);
}

/* Per-day episode counts for the last `days` days, oldest first. */
export function dailyCounts(logs, days, nowMs){
  const out = [];
  const dayMs = 86400000;
  const base = new Date(nowMs); base.setHours(0, 0, 0, 0);
  for(let i = days - 1; i >= 0; i--){
    const start = base.getTime() - i * dayMs;
    const end = start + dayMs;
    const count = logs.filter(e => e.ts >= start && e.ts < end).length;
    const d = new Date(start);
    out.push({ ts: start, label: (d.getMonth() + 1) + '/' + d.getDate(), count });
  }
  return out;
}

export function average(nums){
  const xs = nums.filter(n => n !== '' && n != null && !Number.isNaN(Number(n))).map(Number);
  if(!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/* Parse a pattern string like "in:4,out:6" or "in:4,hold:4,out:4,hold:4"
   into [[type, seconds], ...]. Returns null if any token is invalid. */
export function parsePattern(str){
  const phases = String(str).split(',').map(s => s.trim()).filter(Boolean).map(p => {
    const [type, sec] = p.split(':').map(x => (x || '').trim());
    const n = parseInt(sec, 10);
    if(!['in','out','hold'].includes(type) || !(n > 0)) return null;
    return [type, n];
  });
  if(!phases.length || phases.includes(null)) return null;
  return phases;
}

export function phasesToString(phases){
  return phases.map(([t, n]) => t + ':' + n).join(', ');
}

/* Map an exactly-timed episode (seconds) to the log's duration bucket so a
   live timer can pre-fill the same field the manual buttons set. Boundaries
   match the seg buttons: <1 min / 1–5 min / 5–15 min / >15 min. */
export function bucketForDuration(sec){
  const s = Number(sec);
  if(!(s >= 0)) return '';
  if(s < 60) return '<1 min';
  if(s < 300) return '1–5 min';
  if(s < 900) return '5–15 min';
  return '>15 min';
}

/* ---------------------------------------------------------------- anti-spiral
   Help the user calm down, capture what a doctor needs, then get off the phone.
   These keep app-open tracking and the guardrail threshold pure/testable. */

/* App-open timestamps within the last `windowMs` (default 1 hour). Also prunes
   stale entries — used both to decide the guardrail and to keep the list small. */
export function recentOpens(times, nowMs, windowMs = 3600000){
  return (times || []).filter(t => typeof t === 'number' && t > nowMs - windowMs && t <= nowMs);
}
/* Show the gentle "you've checked a few times" guardrail after MORE THAN
   `threshold` opens in the window (default: >3 in 60 min). */
export function shouldShowGuardrail(times, nowMs, windowMs = 3600000, threshold = 3){
  return recentOpens(times, nowMs, windowMs).length > threshold;
}

/* All calm-handoff / guardrail copy lives here so the wording is single-sourced
   and unit-testable. It stays clinically humble: it never tells the user they
   are "safe", that this is "benign", or that it was "just anxiety". */
export const CALM_COPY = {
  saved:       "Episode saved. You've captured enough for now.",
  doneTitle:   "Good. You've recorded what a doctor needs for now. Feet on the floor, slow exhale, phone down.",
  doneSafety:  "If emergency symptoms appear or things worsen, use the safety guidance and seek help.",
  guardrail:   "You've checked this a few times. Pause for one breath. Are you needing care, or reassurance?",
  loggedEnough:"You've captured enough. Take one slow breath out, put the phone down, and do the next small steady thing.",
  emergency:   "Call 000 now if palpitations come with chest pain, chest pressure or tightness, severe shortness of breath, fainting, blackouts, severe dizziness, new confusion, pain or tightness spreading to your jaw, back, neck, arm or stomach, or symptoms that are getting worse or will not settle. Do not drive yourself.",
  sameday:     "This may need medical review today. Call your GP, an urgent care service, or Healthdirect on 1800 022 222. If symptoms worsen or emergency signs appear, call 000.",
  trends:      "Use this as a weekly review for your GP or cardiologist, not a minute-by-minute reassurance check. Patterns are not proof of cause.",
  prayer:      "Lord, help me receive this moment with courage and wisdom. Help me seek help if I need it, breathe slowly if I can, and entrust what I cannot control to You.",
};
/* Reassurance phrases the app must never use (a clinically-humble guardrail).
   'safe' is intentionally excluded as a bare token because 'safety' is legitimate. */
export const BANNED_REASSURANCE = ['benign', 'you are safe', "you're safe", 'just anxiety', 'nothing is wrong', 'all in your head'];
export function hasBannedReassurance(text){
  const t = String(text).toLowerCase();
  return BANNED_REASSURANCE.some(p => t.includes(p));
}

/* Symptoms that, on their own, warrant calling 000. Deliberately does NOT
   include 'irregular', 'dizzy', 'wheeze' or 'breathless_mild' — per
   RACGP/Healthdirect, irregular pulse alone is a same-day review, but irregular
   + chest pain is urgent. 'radiating' (jaw/back/neck/arm/stomach) and new
   'confusion' are cardinal red flags. Medication/substance context never
   appears here, so a reliever or decongestant alone never triggers 000. */
export const EMERGENCY_SIGNALS = ['chestpain', 'tightchest', 'breathless', 'fainted', 'radiating', 'confusion'];

/* Three-level escalation (call 000 / same-day review / log & discuss).
   Inputs come from the palp safety check (flags) or the log form. `flags` may
   include Stage-2 associated-symptom keys. Old entries use rhythm/context;
   new ones use rhythmFeel/episodeContext — both are honoured. Returns
   { level, reasons }; level is '000' | 'sameday' | 'log'. */
export function escalationLevel({ flags = [], rhythm = '', rhythmFeel = '', duration = '', context = '', episodeContext = [] } = {}){
  const has = k => flags.includes(k);
  const irregular = has('irregular') || rhythm === 'irregular' || rhythmFeel === 'irregular';
  const exertional = context === 'on exertion' || (episodeContext || []).some(c => /exercise|exertion/.test(c));

  // Level 1 — call 000 now
  const emergency = EMERGENCY_SIGNALS.filter(has);
  if(has('dizzy') && irregular) emergency.push('dizzy+irregular');
  if(has('dizzy') && has('wontsettle')) emergency.push('dizzy+wontsettle');
  if(emergency.length) return { level: '000', reasons: emergency };

  // Level 2 — get checked today
  const sameday = [];
  if(irregular) sameday.push('irregular');
  if(has('dizzy')) sameday.push('dizzy');
  if(has('wheeze')) sameday.push('wheeze');
  if(has('wontsettle')) sameday.push('wontsettle');
  if(duration === '>15 min') sameday.push('sustained');
  if(exertional) sameday.push('exertional');
  if(sameday.length) return { level: 'sameday', reasons: sameday };

  return { level: 'log', reasons: [] };
}

/* ---------------------------------------------------------------- log schema
   Two-stage diary: Stage 1 captures fast basics; Stage 2 adds optional clinical
   detail when settled. New fields are added without breaking old entries. */
export const SCHEMA_VERSION = 2;

/* Unify symptom keys across the old `flags` and the new `associatedSymptoms`. */
export function entrySymptoms(e){
  return [...(e.flags || []), ...(e.associatedSymptoms || [])];
}
export function entryIrregular(e){
  return e.rhythmFeel === 'irregular' || e.rhythm === 'irregular';
}
export function entryExertional(e){
  if(e.context === 'on exertion') return true;
  return (e.episodeContext || []).some(c => /exercise|exertion/.test(c));
}
export function entryHelped(e){
  const v = e.breathingResponse || e.helped || '';
  return ['yes', 'partly', 'helped', 'partly helped'].includes(v);
}
export function entryReliever(e){
  return e.ventolinRecent === true ||
    !!(e.medicationContext && e.medicationContext.relieverUsed === 'yes');
}

/* Fill missing fields so old logs render and export safely, and stamp the
   current schema version. Existing values always win over the defaults. */
export function normalizeEntry(e){
  return Object.assign({
    flags: [], sensation: [], rhythmFeel: '', episodeContext: [],
    breathingResponse: '', onset: '', offset: '', associatedSymptoms: [],
    medicationContext: {}, stressContext: {}, detailAddedAt: null,
  }, e || {}, { schemaVersion: SCHEMA_VERSION });
}
export function normalizeLogs(logs){ return (logs || []).map(normalizeEntry); }
