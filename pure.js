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
    if(e.pulse) s += '\n  Pulse: ' + e.pulse;
    if(e.stress !== '' && e.stress != null) s += '\n  Stress: ' + e.stress + '/10';
    if(e.triggers) s += '\n  Triggers: ' + e.triggers;
    if(e.note) s += '\n  Note: ' + e.note;
    return s;
  }).join('\n');
}

export function logsToCSV(logs, FLAG_LABEL){
  const head = ['timestamp','symptoms','pulse','stress','triggers','note'];
  const rows = logs.map(e => [
    new Date(e.ts).toISOString(),
    (e.flags || []).map(f => FLAG_LABEL[f] || f).join('; '),
    e.pulse ?? '', e.stress ?? '', e.triggers ?? '',
    String(e.note || '').replace(/\n/g, ' '),
  ]);
  return [head, ...rows]
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
