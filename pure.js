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

export function logsToText(logs, FLAG_LABEL){
  if(!logs.length) return 'No episodes logged.';
  return 'Palpitation log\n===============\n' + logs.map(e => {
    const d = new Date(e.ts).toLocaleString();
    let s = '• ' + d;
    if(e.flags && e.flags.length) s += '\n  Symptoms: ' + e.flags.map(f => FLAG_LABEL[f] || f).join(', ');
    if(e.duration) s += '\n  Duration: ' + e.duration + (e.durationSec ? ` (timed: ${fmt(e.durationSec)})` : '');
    if(e.rhythm) s += '\n  Rhythm: ' + e.rhythm;
    if(e.context) s += '\n  When: ' + e.context;
    if(e.pulse) s += '\n  Pulse before: ' + e.pulse;
    if(e.pulseAfter) s += '\n  Pulse after: ' + e.pulseAfter;
    if(e.activity) s += '\n  Doing before: ' + e.activity;
    if(e.helped) s += '\n  Breathing helped: ' + e.helped;
    if(e.coughTiming && e.coughTiming !== 'none') s += '\n  Cough timing: ' + e.coughTiming;
    if(e.ventolinRecent) s += '\n  Ventolin in last 4h: yes';
    if(e.stress !== '' && e.stress != null) s += '\n  Stress: ' + e.stress + '/10';
    if(e.triggers) s += '\n  Triggers: ' + e.triggers;
    if(e.note) s += '\n  Note: ' + e.note;
    return s;
  }).join('\n');
}

export const CSV_HEAD = ['timestamp','symptoms','duration','duration_sec','rhythm','context',
  'pulse_before','pulse_after','activity','breathing_helped','cough_timing',
  'ventolin_recent','stress','triggers','note'];

export function logsToCSV(logs, FLAG_LABEL){
  const rows = logs.map(e => [
    new Date(e.ts).toISOString(),
    (e.flags || []).map(f => FLAG_LABEL[f] || f).join('; '),
    e.duration ?? '', e.durationSec ?? '', e.rhythm ?? '', e.context ?? '',
    e.pulse ?? '', e.pulseAfter ?? '', e.activity ?? '',
    e.helped ?? '', e.coughTiming ?? '', e.ventolinRecent ? 'yes' : '',
    e.stress ?? '', e.triggers ?? '',
    String(e.note || '').replace(/\n/g, ' '),
  ]);
  return [CSV_HEAD, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function aggregatePrep(logs, care, RED){
  const byDay = {};
  logs.forEach(e => { const k = new Date(e.ts).toLocaleDateString(); byDay[k] = (byDay[k] || 0) + 1; });
  const has = f => logs.filter(e => (e.flags || []).includes(f)).length;
  return {
    total: logs.length,
    byDay,
    withCough: has('cough'),
    withFlush: has('flushed'),
    withRed: logs.filter(e => (e.flags || []).some(f => RED.includes(f))).length,
    withVent: has('ventolin'),
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
    avgStress: average(logs.map(e => e.stress)),
    avgPulse: average(logs.map(e => e.pulse)),
    ventolinRecent: logs.filter(e => e.ventolinRecent).length,
    irregular: logs.filter(e => e.rhythm === 'irregular').length,
    onExertion: logs.filter(e => e.context === 'on exertion').length,
    helped: logs.filter(e => e.helped === 'yes' || e.helped === 'partly').length,
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

/* Symptoms that, on their own, warrant calling 000. Deliberately does NOT
   include 'irregular' or 'dizzy' alone — per RACGP/Healthdirect, irregular
   pulse alone is a same-day review, but irregular + chest pain is urgent. */
export const EMERGENCY_SIGNALS = ['chestpain', 'tightchest', 'breathless', 'fainted'];

/* Three-level escalation (call 000 / same-day review / log & discuss).
   Inputs come from either the palp safety check (flags only) or the log form
   (flags + rhythm/duration/context segments). Returns { level, reasons }.
   level is one of '000' | 'sameday' | 'log'. */
export function escalationLevel({ flags = [], rhythm = '', duration = '', context = '' } = {}){
  const has = k => flags.includes(k);
  const irregular = has('irregular') || rhythm === 'irregular';

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
  if(context === 'on exertion') sameday.push('exertional');
  if(sameday.length) return { level: 'sameday', reasons: sameday };

  return { level: 'log', reasons: [] };
}
