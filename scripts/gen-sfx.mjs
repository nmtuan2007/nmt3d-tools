// Synthesizes the bundled Global Sound Bank so the repo ships no third-party audio.
// Deterministic: re-running produces byte-identical files. Run: node scripts/gen-sfx.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 48000;
const OUT = fileURLToPath(new URL("../src-tauri/assets/global_sfx/", import.meta.url));

let seed = 1337;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const buf = (sec) => new Float32Array(Math.round(sec * RATE));
const TAU = 2 * Math.PI;

function click(out, at, gain, decay, freq) {
  const start = Math.round(at * RATE);
  for (let i = 0; i < 0.04 * RATE && start + i < out.length; i++) {
    const t = i / RATE;
    out[start + i] += gain * Math.exp(-t / decay) * (0.6 * rand() + 0.4 * Math.sin(TAU * freq * t));
  }
}

// partials: [ratio, gain] pairs; inharmonic ratios give the bell/plate character
function ping(out, at, freq, gain, decay, partials = [[1, 1]]) {
  const start = Math.round(at * RATE);
  for (let i = 0; start + i < out.length; i++) {
    const t = i / RATE;
    const e = Math.min(1, t / 0.002) * Math.exp(-t / decay);
    if (e < 1e-4 && t > 0.01) break;
    let s = 0;
    for (const [r, g] of partials) s += g * Math.sin(TAU * freq * r * t);
    out[start + i] += gain * e * s;
  }
}

function chirp(out, at, f0, f1, dur, gain, decay) {
  const start = Math.round(at * RATE);
  let phase = 0;
  for (let i = 0; start + i < out.length && i < (dur + decay * 6) * RATE; i++) {
    const t = i / RATE;
    phase += (TAU * (f0 + (f1 - f0) * Math.min(1, t / dur))) / RATE;
    out[start + i] += gain * Math.exp(-Math.max(0, t - dur) / decay) * Math.sin(phase);
  }
}

const sounds = {
  ui: {
    // Ratchet ticks that slow down like the 3.2s ease-out wheel.
    sfx_gacha_spin() {
      const out = buf(3.4);
      const n = 40;
      for (let k = 1; k < n; k++) click(out, 3.2 * (1 - Math.cbrt(1 - k / n)), 0.8, 0.003, 2200 + 900 * rand());
      return out;
    },
    sfx_gacha_win() {
      const out = buf(1.8);
      const bell = [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.93, 0.08]];
      ping(out, 0, 880, 0.6, 0.5, bell);
      ping(out, 0.12, 1318.5, 0.5, 0.6, bell);
      ping(out, 0.24, 1760, 0.4, 0.7, bell);
      return out;
    },
    sfx_verdict_boost() {
      const out = buf(0.45);
      chirp(out, 0, 300, 1200, 0.07, 0.8, 0.09);
      ping(out, 0.07, 1200, 0.4, 0.12, [[1, 1], [2, 0.3]]);
      return out;
    },
  },
  foley: {
    // High-speed stepper whine: odd harmonics ramping 400 -> 900 Hz, faded for seamless looping.
    sfx_stepper_loop() {
      const out = buf(2.0);
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const f = 400 + 500 * Math.min(1, t / 0.5);
        phase += (TAU * f) / RATE;
        const square = Math.sin(phase) + Math.sin(3 * phase) / 3 + Math.sin(5 * phase) / 5;
        const fade = Math.min(1, t / 0.02, (2.0 - t) / 0.02);
        out[i] = fade * (0.5 * square * (0.85 + 0.15 * Math.sin(TAU * 37 * t)) + 0.05 * rand());
      }
      return out;
    },
    // Paper whoosh: noise through a lowpass whose cutoff sweeps up and back down.
    sfx_slicer_pass() {
      const out = buf(0.7);
      let y = 0;
      for (let i = 0; i < out.length; i++) {
        const p = i / out.length;
        const a = 0.02 + 0.25 * Math.sin(Math.PI * p);
        y += a * (rand() - y);
        out[i] = Math.sin(Math.PI * p) ** 2 * y;
      }
      return out;
    },
    sfx_action_flick() {
      const out = buf(0.35);
      chirp(out, 0, 600, 3000, 0.06, 0.5, 0.02);
      click(out, 0.06, 1, 0.002, 4000);
      return out;
    },
  },
  asmr: {
    // Flex plate release: sharp transient plus a short metallic ring.
    sfx_plate_snap_sharp() {
      const out = buf(0.5);
      click(out, 0, 1, 0.005, 3000);
      ping(out, 0.001, 2200, 0.35, 0.08, [[1, 1], [1.53, 0.5], [2.41, 0.25]]);
      return out;
    },
    // Tree support removal: a dense cluster of irregular plastic cracks.
    sfx_tree_support_crush() {
      const out = buf(0.9);
      for (let k = 0; k < 70; k++) {
        const at = 0.75 * ((rand() + 1) / 2) ** 1.5;
        click(out, at, 0.3 + 0.7 * Math.abs(rand()), 0.002 + 0.004 * Math.abs(rand()), 1500 + 3500 * Math.abs(rand()));
      }
      return out;
    },
  },
};

function wav(samples) {
  let peak = 1e-9;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); // PCM fmt chunk size
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28); // byte rate
  data.writeUInt16LE(2, 32); // block align
  data.writeUInt16LE(16, 34); // bits per sample
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => data.writeInt16LE(Math.round((s / peak) * 0.89 * 32767), 44 + i * 2));
  return data;
}

for (const [category, entries] of Object.entries(sounds)) {
  mkdirSync(OUT + category, { recursive: true });
  for (const [id, make] of Object.entries(entries)) {
    writeFileSync(`${OUT}${category}/${id}.wav`, wav(make()));
    console.log(`${category}/${id}.wav`);
  }
}
