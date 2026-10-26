import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { newProject } from "../../services/project";
import { saveRecordedClip } from "../../services/tauriBridge";
import { useConfigStore } from "../../store/useConfigStore";
import { useGachaStore } from "../../store/useGachaStore";
import { useProjectStore } from "../../store/useProjectStore";
import type { ModelSource } from "../../types";
import { SPIN_MS, TAIL_MS, TAU, sliceAt, spinEase, targetRotation } from "./spinMath";
import { loadThumb } from "./thumbnails";

// The canvas is the video: 1080x1920 (9:16), captured at 60fps.
const W = 1080;
const H = 1920;
const CX = 540;
const CY = 900;
const R = 450;
const MAX_SLICES = 12;
const COLORS = ["#f97316", "#0ea5e9", "#a855f7", "#22c55e", "#eab308", "#ec4899"];
// WebView2 records H.264 MP4 natively; WebM is the fallback for older runtimes.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.64002A,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

interface Slice {
  model: ModelSource;
  img?: HTMLImageElement;
}
type Phase = "idle" | "spinning" | "won";
interface Sound {
  ctx: AudioContext;
  out: GainNode;
  dest: MediaStreamAudioDestinationNode;
}

const randomInt = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…");
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function paint(ctx: CanvasRenderingContext2D, slices: Slice[], rotation: number, phase: Phase, winner: number, pulse: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 92px system-ui, sans-serif";
  ctx.fillText("3D PRINT GACHA", CX, 210);
  ctx.fillStyle = "#c7d2fe";
  ctx.font = "500 44px system-ui, sans-serif";
  ctx.fillText("what am I printing today?", CX, 280);

  if (!slices.length) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("Load a model pool to spin", CX, CY);
    return;
  }

  const n = slices.length;
  const s = TAU / n;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(rotation);
  slices.forEach((slice, i) => {
    const a0 = -Math.PI / 2 + i * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a0 + s);
    ctx.closePath();
    ctx.globalAlpha = phase === "won" && i !== winner ? 0.3 : 1;
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0b1020";
    ctx.stroke();

    const mid = a0 + s / 2;
    const rr = R * 0.66;
    const ir = Math.min(R * 0.24, rr * Math.sin(s / 2) * 0.9);
    ctx.save();
    ctx.translate(Math.cos(mid) * rr, Math.sin(mid) * rr);
    ctx.rotate(mid + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, ir, 0, TAU);
    ctx.clip();
    if (slice.img) drawCover(ctx, slice.img, -ir, -ir, ir * 2, ir * 2);
    else {
      ctx.fillStyle = "#111827";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(ir)}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(slice.model.title.charAt(0).toUpperCase() || "?", 0, 0);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  });
  ctx.restore();

  ctx.beginPath();
  ctx.arc(CX, CY, 64, 0, TAU);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(CX - 42, CY - R - 56);
  ctx.lineTo(CX + 42, CY - R - 56);
  ctx.lineTo(CX, CY - R + 24);
  ctx.closePath();
  ctx.fillStyle = "#fde047";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#0b1020";
  ctx.stroke();

  // Card for whatever sits under the pointer; it becomes the reveal once the wheel stops.
  const current = slices[phase === "won" ? winner : sliceAt(rotation, n)];
  const cardY = 1450;
  ctx.beginPath();
  ctx.roundRect(60, cardY, W - 120, 380, 40);
  ctx.fillStyle = phase === "won" ? `rgba(253, 224, 71, ${0.15 + 0.3 * pulse})` : "rgba(255, 255, 255, 0.08)";
  ctx.fill();
  if (current.img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(90, cardY + 30, 320, 320, 28);
    ctx.clip();
    drawCover(ctx, current.img, 90, cardY + 30, 320, 320);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = phase === "won" ? "#fde047" : "#e0e7ff";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText({ idle: "SPIN TO PICK", spinning: "SPINNING…", won: "YOU GOT" }[phase], 450, cardY + 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 52px system-ui, sans-serif";
  wrapText(ctx, current.model.title, 450, cardY + 160, W - 540, 60, 3);
  ctx.fillStyle = "#c7d2fe";
  ctx.font = "500 34px system-ui, sans-serif";
  wrapText(ctx, `by ${current.model.designer} · ${current.model.platform}`, 450, cardY + 345, W - 540, 40, 1);
}

function makeAudio(): Sound {
  const ctx = new AudioContext();
  const out = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  out.gain.value = 0.8;
  out.connect(ctx.destination); // speakers
  out.connect(dest); // recording
  return { ctx, out, dest };
}

function tone({ ctx, out }: Sound, freq: number, type: OscillatorType, at: number, peak: number, length: number) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const tick = (a: Sound) => tone(a, 1700, "square", 0, 0.25, 0.035);
const fanfare = (a: Sound) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(a, f, "triangle", i * 0.06, 0.35, 0.42));

function startRecorder(canvas: HTMLCanvasElement, audio: Sound) {
  const video = canvas.captureStream(60).getVideoTracks();
  const stream = new MediaStream([...video, ...audio.dest.stream.getAudioTracks()]);
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          video.forEach((t) => t.stop()); // the audio track is reused by the next spin
          resolve(new Blob(chunks, { type: rec.mimeType }));
        };
        rec.stop();
      }),
  };
}

/** The file's own duration; the wall-clock recording time runs a little long. */
async function clipDurationMs(path: string, fallbackMs: number): Promise<number> {
  const v = document.createElement("video");
  v.src = convertFileSrc(path);
  try {
    await new Promise((ok, fail) => {
      v.onloadedmetadata = ok;
      v.onerror = fail;
    });
    return Number.isFinite(v.duration) ? Math.floor(v.duration * 1000) : fallbackMs;
  } catch {
    return fallbackMs;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

const animate = (ms: number, frame: (p: number) => void) =>
  new Promise<void>((done) => {
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      frame(p);
      if (p < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });

export function RouletteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pool = useGachaStore((s) => s.pool);
  const spinNonce = useGachaStore((s) => s.spinNonce);
  const [slices, setSlices] = useState<Slice[]>([]);
  const view = useRef({ slices, rotation: 0, phase: "idle" as Phase, winner: 0, pulse: 0 });
  const audioRef = useRef<Sound>(undefined);
  view.current.slices = slices;

  const redraw = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const v = view.current;
    if (ctx) paint(ctx, v.slices, v.rotation, v.phase, v.winner, v.pulse);
  };

  useEffect(() => {
    let live = true;
    const picked = shuffle(pool).slice(0, MAX_SLICES).map((model) => ({ model }));
    view.current.phase = "idle";
    setSlices(picked);
    for (const slice of picked) {
      loadThumb(slice.model.thumbnailUrl)
        .then((img) => live && setSlices((cur) => cur.map((c) => (c.model === slice.model ? { ...c, img } : c))))
        .catch(() => {}); // the slice falls back to an initial letter
    }
    return () => {
      live = false;
    };
  }, [pool]);

  useEffect(() => {
    if (!useGachaStore.getState().spinning) redraw();
  }, [slices]);

  const handledNonce = useRef(spinNonce);
  useEffect(() => {
    if (spinNonce === handledNonce.current) return;
    handledNonce.current = spinNonce;
    void spin();
  }, [spinNonce]);

  async function spin() {
    const gacha = useGachaStore.getState();
    const canvas = canvasRef.current;
    const wheel = view.current.slices;
    const outputDir = useConfigStore.getState().outputDir;
    if (!canvas || !wheel.length || gacha.spinning) return;
    if (!outputDir) return gacha.setSpinning(false, "Set an output folder in Settings first.");
    gacha.setSpinning(true);
    try {
      const audio = (audioRef.current ??= makeAudio());
      await audio.ctx.resume();
      const v = view.current;
      const winner = randomInt(wheel.length);
      const from = v.rotation % TAU;
      const to = targetRotation(winner, wheel.length, 8);
      let last = sliceAt(from, wheel.length);
      v.phase = "spinning";

      const recorder = startRecorder(canvas, audio);
      const t0 = performance.now();
      await animate(SPIN_MS, (p) => {
        v.rotation = from + (to - from) * spinEase(p);
        const idx = sliceAt(v.rotation, wheel.length);
        if (idx !== last) {
          last = idx;
          tick(audio);
        }
        redraw();
      });
      v.phase = "won";
      v.winner = winner;
      fanfare(audio);
      await animate(TAIL_MS, (p) => {
        v.pulse = Math.sin(p * Math.PI * 3) ** 2;
        redraw();
      });
      const clip = await recorder.stop();
      const elapsedMs = Math.round(performance.now() - t0);

      const { model, img } = wheel[winner];
      const manifest = newProject(model, outputDir);
      const screenRecordFile = await saveRecordedClip(manifest.exportPaths.rootDirectory, clip);
      const recordingMs = await clipDurationMs(screenRecordFile, elapsedMs);
      gacha.setWinner(model);
      useProjectStore
        .getState()
        .startProject(
          { ...manifest, exportPaths: { ...manifest.exportPaths, screenRecordFile } },
          recordingMs,
          img && { width: img.naturalWidth, height: img.naturalHeight },
        );
      gacha.setSpinning(false);
    } catch (e) {
      gacha.setSpinning(false, `Spin failed: ${e}`);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="aspect-9/16 h-full max-h-[calc(100vh-9rem)] rounded-xl border border-zinc-800 bg-black shadow-2xl"
    />
  );
}
