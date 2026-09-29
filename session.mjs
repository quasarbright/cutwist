// The parts of a solving session that aren't drawing or input: the undo history, recorded
// algorithms and the solve timer. No DOM and no animation, so the page and the tests share
// them (index.html plays the moves these hand back).

// ---------- history and algorithms ----------
// Each history entry is one undo step: a list of moves (one for a turn by hand, a whole
// algorithm for a playback). inverse(move) is the move that undoes it.
//
// A recording notes where in the history it began; stopping takes every turn made since
// (following undo and redo, so an undone turn isn't in it) as a new algorithm, named A, B,
// C… Scramble and reset clear the history (clear()), but a recording keeps what it had.
export class History {
  constructor(inverse) {
    this.inverse = inverse;
    this.entries = [];
    this.cursor = 0;
    this.algorithms = []; // { name, moves }
    this.recording = null; // { from: entry index, kept: moves from before a clear() }
  }

  // the moves that undo `moves`, in order
  inverseOf(moves) {
    return moves.slice().reverse().map((m) => this.inverse(m));
  }

  record(moves) {
    this.entries.length = this.cursor;
    this.entries.push(moves);
    this.cursor++;
  }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.entries.length; }
  // the moves to play to undo the last step, or null
  undo() {
    if (!this.canUndo) return null;
    this.cursor--;
    if (this.recording && this.cursor < this.recording.from) this.recording.from = this.cursor;
    return this.inverseOf(this.entries[this.cursor]);
  }
  // the moves to play to redo the next step, or null
  redo() {
    if (!this.canRedo) return null;
    return this.entries[this.cursor++];
  }
  // moves made so far (an algorithm playback counts each of its turns)
  get movesDone() {
    return this.entries.slice(0, this.cursor).reduce((n, e) => n + e.length, 0);
  }
  get length() { return this.entries.length; }
  clear() {
    if (this.recording) {
      this.recording.kept.push(...this.entries.slice(this.recording.from, this.cursor).flat());
      this.recording.from = 0;
    }
    this.entries = [];
    this.cursor = 0;
  }
  // a new puzzle: nothing carries over, algorithms included
  reset() {
    this.entries = [];
    this.cursor = 0;
    this.algorithms = [];
    this.recording = null;
  }

  get isRecording() { return !!this.recording; }
  get recorded() {
    if (!this.recording) return [];
    return [...this.recording.kept, ...this.entries.slice(this.recording.from, this.cursor).flat()];
  }
  startRecording() {
    if (!this.recording) this.recording = { from: this.cursor, kept: [] };
  }
  // stops; returns the new algorithm, or null when nothing was recorded
  stopRecording() {
    const moves = this.recorded;
    this.recording = null;
    if (!moves.length) return null;
    const alg = { name: this.nextName(), moves };
    this.algorithms.push(alg);
    return alg;
  }
  nextName() {
    const free = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((c) => !this.algorithms.some((a) => a.name === c));
    return free || `#${this.algorithms.length + 1}`;
  }
  algorithm(name) { return this.algorithms.find((a) => a.name === name) || null; }
  deleteAlgorithm(name) { this.algorithms = this.algorithms.filter((a) => a.name !== name); }
  // records a playback of the named algorithm (inverted if reverse) as one step; returns
  // the moves to play, or null
  playAlgorithm(name, reverse = false) {
    const alg = this.algorithm(name);
    if (!alg || !alg.moves.length) return null;
    const moves = reverse ? this.inverseOf(alg.moves) : alg.moves.slice();
    this.record(moves);
    return moves;
  }
}

// ---------- solve timer ----------
// Armed by a scramble; the first turn after starts it; solving stops it. Pausing stops the
// clock until the next turn (or resume). now: a clock in ms (performance.now in the page).
export class SolveTimer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.clear();
  }
  // hidden: no scramble to time
  clear() { this.t = null; }
  arm() { this.t = { acc: 0, since: null, started: false, paused: false, done: false }; }
  // "hidden" | "armed" | "running" | "paused" | "done"
  get state() {
    const t = this.t;
    if (!t) return "hidden";
    if (t.done) return "done";
    if (t.since !== null) return "running";
    return t.paused ? "paused" : "armed";
  }
  get ms() {
    const t = this.t;
    return t ? t.acc + (t.since !== null ? this.now() - t.since : 0) : 0;
  }
  // a turn: starts an armed timer, or resumes a paused one
  turn() {
    const t = this.t;
    if (!t || t.done || t.since !== null) return;
    t.since = this.now();
    t.started = true;
    t.paused = false;
  }
  resume() { if (this.state === "paused") this.turn(); }
  pause() { this.stop(false); }
  solved() { this.stop(true); }
  stop(done) {
    const t = this.t;
    if (!t || t.since === null) return;
    t.acc = this.ms;
    t.since = null;
    if (done) t.done = true;
    else t.paused = true;
  }
}

// 12.34, or 1:02.34 past a minute
export function formatTime(ms) {
  const cs = Math.floor(ms / 10), s = Math.floor(cs / 100), m = Math.floor(s / 60);
  const tail = `${String(s % 60).padStart(m ? 2 : 1, "0")}.${String(cs % 100).padStart(2, "0")}`;
  return m ? `${m}:${tail}` : tail;
}
