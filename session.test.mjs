// Unit tests for the session logic (session.mjs): undo history, algorithms, solve timer.
// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { History, SolveTimer, formatTime } from "./session.mjs";

// moves are { axis, layer, q } on a made-up puzzle whose axes all turn in quarters
const inverse = (m) => ({ ...m, q: (4 - m.q) % 4 });
const mv = (axis, q = 1) => ({ axis, layer: 0, q });
const R = mv(0), U = mv(1), F = mv(2);

test("history: undo hands back the inverse, redo the move, and a new turn drops the redo", () => {
  const h = new History(inverse);
  assert.equal(h.undo(), null);
  h.record([R]);
  h.record([U]);
  assert.equal(h.movesDone, 2);
  assert.deepEqual(h.undo(), [inverse(U)]);
  assert.equal(h.movesDone, 1);
  assert.ok(h.canRedo);
  assert.deepEqual(h.redo(), [U]);
  assert.equal(h.redo(), null);
  h.undo();
  h.record([F]); // replaces the undone U
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.entries, [[R], [F]]);
});

test("history: a multi-move step undoes in one go, last move first", () => {
  const h = new History(inverse);
  h.record([R, U, F]);
  assert.equal(h.movesDone, 3);
  assert.deepEqual(h.undo(), [inverse(F), inverse(U), inverse(R)]);
  assert.equal(h.movesDone, 0);
});

test("history: clear keeps algorithms, reset drops everything", () => {
  const h = new History(inverse);
  h.startRecording(); h.record([R]); h.stopRecording();
  h.record([U]);
  h.clear();
  assert.equal(h.length, 0);
  assert.equal(h.algorithms.length, 1);
  h.reset();
  assert.equal(h.algorithms.length, 0);
});

test("recording: takes the turns made since it started, following undo and redo", () => {
  const h = new History(inverse);
  h.record([F]); // before recording: not in it
  h.startRecording();
  h.record([R]);
  h.record([U]);
  h.undo(); // U is undone, so it's not in the algorithm
  assert.deepEqual(h.recorded, [R]);
  h.redo();
  assert.deepEqual(h.recorded, [R, U]);
  const alg = h.stopRecording();
  assert.deepEqual(alg, { name: "A", moves: [R, U] });
  assert.equal(h.isRecording, false);
});

test("recording: undoing past where it started, then turning, keeps only the new turns", () => {
  const h = new History(inverse);
  h.record([F]);
  h.startRecording();
  h.undo(); // undoes F, from before the recording
  h.record([R]);
  assert.deepEqual(h.recorded, [R]);
});

test("recording: survives a clear (scramble, reset) with what it had", () => {
  const h = new History(inverse);
  h.startRecording();
  h.record([R]);
  h.clear();
  h.record([U]);
  assert.deepEqual(h.stopRecording().moves, [R, U]);
});

test("recording: nothing recorded makes no algorithm", () => {
  const h = new History(inverse);
  h.startRecording();
  assert.equal(h.stopRecording(), null);
  assert.equal(h.algorithms.length, 0);
});

test("algorithms: named A, B, C, reusing a freed letter", () => {
  const h = new History(inverse);
  for (const m of [R, U, F]) { h.startRecording(); h.record([m]); h.stopRecording(); }
  assert.deepEqual(h.algorithms.map((a) => a.name), ["A", "B", "C"]);
  h.deleteAlgorithm("B");
  h.startRecording(); h.record([R]); h.stopRecording();
  assert.deepEqual(h.algorithms.map((a) => a.name), ["A", "C", "B"]);
});

test("algorithms: playback is one undo step, reverse plays the inverse", () => {
  const h = new History(inverse);
  h.startRecording(); h.record([R]); h.record([U, F]); h.stopRecording();
  const before = h.movesDone;
  assert.deepEqual([...h.playAlgorithm("A")], [R, U, F]);
  assert.equal(h.movesDone, before + 3);
  assert.equal(h.entries.at(-1).length, 3);
  assert.deepEqual(h.entries.at(-1).alg, { name: "A", reverse: false }); // (it knows where it came from)
  assert.deepEqual([...h.playAlgorithm("A", true)], [inverse(F), inverse(U), inverse(R)]);
  assert.deepEqual(h.entries.at(-1).alg, { name: "A", reverse: true });
  assert.deepEqual(h.undo(), [R, U, F]); // undoing the reverse playback plays A again
  assert.equal(h.playAlgorithm("Z"), null);
});

test("algorithms: playing one while recording puts its turns in the new one", () => {
  const h = new History(inverse);
  h.startRecording(); h.record([R, U]); h.stopRecording();
  h.startRecording();
  h.playAlgorithm("A");
  h.record([F]);
  assert.deepEqual(h.stopRecording().moves, [R, U, F]);
});

// a clock the test moves by hand
const clock = () => { let t = 1000; const now = () => t; now.advance = (ms) => { t += ms; }; return now; };

test("timer: hidden until armed; armed until the first turn; runs until solved", () => {
  const now = clock(), t = new SolveTimer(now);
  assert.equal(t.state, "hidden");
  t.turn(); // no scramble yet: nothing to time
  assert.equal(t.state, "hidden");
  t.arm();
  assert.equal(t.state, "armed");
  now.advance(5000);
  assert.equal(t.ms, 0); // not counting before the first turn
  t.turn();
  assert.equal(t.state, "running");
  now.advance(1234);
  assert.equal(t.ms, 1234);
  t.solved();
  assert.equal(t.state, "done");
  now.advance(9999);
  assert.equal(t.ms, 1234); // frozen
  t.turn();
  assert.equal(t.state, "done"); // turning a solved puzzle doesn't restart it
});

test("timer: pause stops the clock; the next turn or resume starts it again", () => {
  const now = clock(), t = new SolveTimer(now);
  t.arm(); t.turn();
  now.advance(1000);
  t.pause();
  assert.equal(t.state, "paused");
  now.advance(60000);
  assert.equal(t.ms, 1000);
  t.turn();
  assert.equal(t.state, "running");
  now.advance(500);
  t.pause();
  t.resume();
  now.advance(250);
  assert.equal(t.ms, 1750);
});

test("timer: pause and resume do nothing unless running / paused", () => {
  const now = clock(), t = new SolveTimer(now);
  t.arm();
  t.pause();
  assert.equal(t.state, "armed");
  t.resume();
  assert.equal(t.state, "armed");
});

test("timer: arming again starts over; clear hides it", () => {
  const now = clock(), t = new SolveTimer(now);
  t.arm(); t.turn(); now.advance(3000); t.solved();
  t.arm();
  assert.equal(t.state, "armed");
  assert.equal(t.ms, 0);
  t.clear();
  assert.equal(t.state, "hidden");
});

test("formatTime: seconds with hundredths, minutes past 60 s", () => {
  assert.equal(formatTime(0), "0.00");
  assert.equal(formatTime(1234), "1.23");
  assert.equal(formatTime(59999), "59.99");
  assert.equal(formatTime(60000), "1:00.00");
  assert.equal(formatTime(62345), "1:02.34");
  assert.equal(formatTime(754321), "12:34.32");
});

test("algorithms: rename, and the steps that played it follow; blank or taken names don't", () => {
  const h = new History(inverse);
  for (const m of [R, U]) { h.startRecording(); h.record([m]); h.stopRecording(); }
  h.playAlgorithm("A");
  assert.equal(h.renameAlgorithm("A", "  sune  "), true);
  assert.deepEqual(h.algorithms.map((a) => a.name), ["sune", "B"]);
  assert.equal(h.entries.at(-1).alg.name, "sune");
  assert.equal(h.renameAlgorithm("sune", "B"), false);
  assert.equal(h.renameAlgorithm("sune", "   "), false);
  assert.equal(h.renameAlgorithm("nope", "C"), false);
  assert.deepEqual(h.algorithms.map((a) => a.name), ["sune", "B"]);
  assert.deepEqual([...h.playAlgorithm("sune")], [R]);
});
