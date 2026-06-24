import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmt, pad2, escHtml, logsToText, logsToCSV, CSV_HEAD, aggregatePrep,
  bpmFromTaps, dailyCounts, average, parsePattern, phasesToString,
  topTriggers, gpStats, icsForReminders,
} from '../pure.js';

const FLAG_LABEL = { cough:'Cough', chestpain:'Chest pain', ventolin:'Ventolin' };
const RED = ['chestpain','breathless','fainted'];

test('pad2 pads to two digits', () => {
  assert.equal(pad2(3), '03');
  assert.equal(pad2(42), '42');
});

test('fmt formats seconds as m:ss and clamps negatives', () => {
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(65), '1:05');
  assert.equal(fmt(300), '5:00');
  assert.equal(fmt(-5), '0:00');
});

test('escHtml escapes angle brackets, ampersands and quotes', () => {
  assert.equal(escHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  // safe inside an attribute value (this is the reminder-label bug fix)
  assert.ok(!escHtml('say "hi"').includes('"'));
});

test('bpmFromTaps estimates from intervals', () => {
  assert.equal(bpmFromTaps(null), null);
  assert.equal(bpmFromTaps([1000]), null);
  // four taps 1s apart -> 60 bpm
  assert.equal(bpmFromTaps([0, 1000, 2000, 3000]), 60);
  // 0.5s apart -> 120 bpm
  assert.equal(bpmFromTaps([0, 500, 1000]), 120);
});

test('average ignores blanks and non-numbers', () => {
  assert.equal(average([]), null);
  assert.equal(average(['', null, undefined]), null);
  assert.equal(average([10, '20', 30]), 20);
});

test('parsePattern parses and validates', () => {
  assert.deepEqual(parsePattern('in:4,out:6'), [['in',4],['out',6]]);
  assert.deepEqual(parsePattern(' in:4 , hold:4 , out:4 '), [['in',4],['hold',4],['out',4]]);
  assert.equal(parsePattern('in:4,bad:6'), null);
  assert.equal(parsePattern('in:0'), null);
  assert.equal(parsePattern(''), null);
});

test('phasesToString round-trips', () => {
  const phases = parsePattern('in:4,hold:2,out:8');
  assert.equal(phasesToString(phases), 'in:4, hold:2, out:8');
});

test('dailyCounts buckets by day, oldest first', () => {
  const now = new Date('2026-06-24T12:00:00').getTime();
  const day = 86400000;
  const logs = [
    { ts: now },                 // today
    { ts: now - day },           // yesterday
    { ts: now - day + 1000 },    // yesterday
  ];
  const out = dailyCounts(logs, 3, now);
  assert.equal(out.length, 3);
  assert.equal(out[out.length - 1].count, 1); // today
  assert.equal(out[out.length - 2].count, 2); // yesterday
});

test('aggregatePrep counts symptoms and red flags', () => {
  const logs = [
    { ts: Date.now(), flags: ['cough','chestpain'] },
    { ts: Date.now(), flags: ['ventolin'] },
    { ts: Date.now(), flags: [] },
  ];
  const a = aggregatePrep(logs, [{ ts: Date.now(), item:'trigger:caffeine' }], RED);
  assert.equal(a.total, 3);
  assert.equal(a.withCough, 1);
  assert.equal(a.withRed, 1);
  assert.equal(a.withVent, 1);
  assert.equal(a.careCount, 1);
});

test('logsToCSV builds a header and escapes quotes', () => {
  const csv = logsToCSV([{ ts: 0, flags:['cough'], duration:'1–5 min', rhythm:'irregular',
    context:'at rest', pulse:80, pulseAfter:72, activity:'sitting', helped:'yes',
    coughTiming:'during', ventolinRecent:true, stress:5, triggers:'caffeine', note:'said "ow"' }], FLAG_LABEL);
  const lines = csv.split('\n');
  assert.equal(lines[0], CSV_HEAD.map(h => `"${h}"`).join(','));
  assert.ok(lines[0].includes('"duration"'));
  assert.ok(lines[0].includes('"pulse_after"'));
  assert.ok(lines[1].includes('""ow""')); // doubled quotes
  assert.ok(lines[1].includes('Cough'));
  assert.ok(lines[1].includes('irregular'));
  assert.ok(lines[1].includes('yes')); // ventolin_recent
});

test('topTriggers ranks free-text triggers', () => {
  const logs = [
    { triggers: 'caffeine, poor sleep' },
    { triggers: 'Caffeine' },
    { triggers: 'alcohol; caffeine' },
  ];
  const top = topTriggers(logs, 3);
  assert.equal(top[0].trigger, 'caffeine');
  assert.equal(top[0].count, 3);
});

test('gpStats adds 7-day window and clinical counts', () => {
  const now = Date.now();
  const logs = [
    { ts: now, flags:['chestpain'], rhythm:'irregular', context:'on exertion', helped:'yes', ventolinRecent:true, stress:6, pulse:110 },
    { ts: now - 10 * 86400000, flags:['cough'], rhythm:'regular', stress:2, pulse:70 },
  ];
  const s = gpStats(logs, [], RED, now);
  assert.equal(s.total, 2);
  assert.equal(s.last7, 1);       // only the recent one
  assert.equal(s.irregular, 1);
  assert.equal(s.ventolinRecent, 1);
  assert.equal(s.onExertion, 1);
  assert.equal(s.withRed, 1);
  assert.equal(Math.round(s.avgPulse), 90);
});

test('icsForReminders emits a daily VEVENT per active reminder', () => {
  const ics = icsForReminders([
    { id:'r1', time:'07:30', label:'Water + food', on:true },
    { id:'r2', time:'21:00', label:'Off one', on:false },
  ], '20260624');
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('DTSTART:20260624T073000'));
  assert.ok(ics.includes('RRULE:FREQ=DAILY'));
  assert.ok(ics.includes('SUMMARY:Water + food'));
  assert.ok(!ics.includes('Off one')); // disabled reminder excluded
});

test('logsToText handles empty and populated logs', () => {
  assert.equal(logsToText([], FLAG_LABEL), 'No episodes logged.');
  const txt = logsToText([{ ts: 0, flags:['cough'], pulse:80, stress:0, triggers:'', note:'hi' }], FLAG_LABEL);
  assert.ok(txt.includes('Symptoms: Cough'));
  assert.ok(txt.includes('Pulse before: 80'));
  assert.ok(txt.includes('Stress: 0/10'));
});
