/**
 * 効果音（v7.7）。
 *
 * 音声ファイルは一切使わず、Web Audio APIでその場で合成する。
 * SfxMark.tsx の描き文字と同じ思想（単一HTML配布のサイズを増やさない）。
 * すべてユーザーの操作（タップ）の中で呼ぶこと — AudioContextはユーザー操作なしでは鳴らせない。
 */

const MUTE_KEY = 'uchikiri-sfx-muted';

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* プライベートモード等で書き込めなくても、今回の操作自体は続行する */
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const AC = window.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    /*
     * iOS Safari対策。生成直後のAudioContextはsuspendedで、resume()は非同期のため、
     * 直後に currentTime を基準に予約した最初の音が鳴らないことがある。
     * 無音のバッファを1つ即座に流してコンテキストを起こしておくと、この取りこぼしが防げる。
     * この関数は必ずタップ処理の中から呼ばれるので、ここで鳴らすのは許可される
     */
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination);
    unlock.start(0);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 個々の音の出口。コンプレッサーを挟み、拍手のように音源を重ねても割れないようにする */
function outlet(c: AudioContext, gainValue: number): GainNode {
  const gain = c.createGain();
  gain.gain.value = gainValue;
  const comp = c.createDynamicsCompressor();
  gain.connect(comp).connect(c.destination);
  return gain;
}

/**
 * コンプレッサーを通さない直結の出口。
 * 既定のコンプレッサーはしきい値-24dBと低めで、playPicoのように音量を張った
 * 持続音を通すと軒並み潰れて小さく聞こえてしまう。1声しか鳴らさない「特別な一発」用に、
 * 割れない範囲で音量を自分で管理する前提で使う
 */
function directOutlet(c: AudioContext, gainValue: number): GainNode {
  const gain = c.createGain();
  gain.gain.value = gainValue;
  gain.connect(c.destination);
  return gain;
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** カード・キャラを選ぶ「シュッ」。フィルタしたノイズを上へ駆け上がらせ、紙が擦れる質感を作る */
export function playFlip(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.14;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(1600, now);
  filter.frequency.exponentialRampToValueAtTime(5200, now + dur * 0.7);
  const gain = outlet(c, 1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(filter).connect(gain);
  src.start(now);
  src.stop(now + dur + 0.02);
}

/**
 * ボタン全般の「カチッ」（v7.8）。
 * カード・キャラの選択（playFlip）や確定（playWrite）のように専用の音を持たない
 * 通常のボタン向け。ノイズの短い打撃音＋高めのトーンを重ね、機械的なクリック感を出す
 */
export function playClick(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const noiseDur = 0.012;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, noiseDur);
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 3200;
  const noiseGain = outlet(c, 1);
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.22, now + 0.003);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);
  noise.connect(noiseFilter).connect(noiseGain);
  noise.start(now);
  noise.stop(now + noiseDur + 0.005);

  const toneDur = 0.03;
  const tone = c.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(1500, now);
  const toneGain = outlet(c, 1);
  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.exponentialRampToValueAtTime(0.06, now + 0.002);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + toneDur);
  tone.connect(toneGain);
  tone.start(now);
  tone.stop(now + toneDur + 0.005);
}

/**
 * 節目のボタン向けの「ピコン↑」（v7.9b）。
 * 「連載開始」「第N話を描く（編集会議を通す）」など、ここから話が動き出す
 * 数少ない大きな一手のためのもの。単音の上ずりだと共有のコンプレッサーに潰されて
 * 弱く聞こえていたため、コンプレッサーを経由しない直結出口で鳴らし、
 * 低い着地の一発＋駆け上がる3音（G5-B5-D5の長三和音）のミニファンファーレにした
 */
export function playPico(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  // 低く短い着地音。ここから始まる、という重みを添える
  const thumpDur = 0.09;
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(160, now);
  thump.frequency.exponentialRampToValueAtTime(55, now + thumpDur);
  const thumpGain = directOutlet(c, 1);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + thumpDur);
  thump.connect(thumpGain);
  thump.start(now);
  thump.stop(now + thumpDur + 0.02);

  // 駆け上がる3音（開幕のファンファーレ）。最後の音を一段大きくして着地を強調する
  const notes = [784.0, 987.77, 1174.66];
  notes.forEach((freq, i) => {
    const t0 = now + i * 0.07;
    const dur = 0.22;
    const isLast = i === notes.length - 1;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    const shimmer = c.createOscillator();
    shimmer.type = 'square';
    shimmer.frequency.setValueAtTime(freq * 2, t0);
    const shimmerGain = c.createGain();
    shimmerGain.gain.value = 0.16;
    const gain = directOutlet(c, 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(isLast ? 0.55 : 0.4, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    shimmer.connect(shimmerGain).connect(gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    shimmer.start(t0);
    shimmer.stop(t0 + dur + 0.02);
  });
}

/**
 * 編集会議で原稿料を使ったときの「チャリーン」（v7.10）。
 * ベルの芯（非整数倍音を重ねて金属的な響きにする）＋硬貨が弾ける粒を数個ずらして重ね、
 * レジで会計したような手応えを作る。playPicoと同じくコンプレッサーを経由しない直結出口で鳴らす
 */
export function playPurchase(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  // ベルの芯。基音+非整数倍音で、正弦波の重ねだけでも金属質な響きになる
  const bellFreq = 1046.5;
  const partials = [1, 2.0, 2.76, 4.07];
  partials.forEach((ratio, i) => {
    const dur = 0.5 - i * 0.08;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(bellFreq * ratio, now);
    const gain = directOutlet(c, 1);
    const peak = i === 0 ? 0.32 : 0.14 / (i + 1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  });

  // 硬貨がはじけて落ちる粒。高めの音程を少しずつ下げながら、時間差で数個重ねる
  const coins = 4;
  for (let i = 0; i < coins; i++) {
    const t0 = now + 0.02 + i * 0.045 + Math.random() * 0.015;
    const dur = 0.09;
    const freq = 2600 + Math.random() * 1800;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.75, t0 + dur);
    const gain = directOutlet(c, 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }
}

/** 今週の話を確定するときの、ペンが走るような「カッカッ…」 */
export function playWrite(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const strokes = 4;
  for (let i = 0; i < strokes; i++) {
    const t0 = now + i * 0.085 + Math.random() * 0.02;
    const dur = 0.05 + Math.random() * 0.03;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000 + Math.random() * 1400;
    const gain = outlet(c, 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }
}

/** ドレミファソラシ（C4大調の1〜7度）。7枚を超えたら1オクターブ上へ乗り継ぎ、上がり続ける印象を保つ */
const SCALE_HZ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];

/** カットイン1枚ごとに鳴らす音。indexは0始まり（1枚目=0=ド） */
export function playCutinNote(index: number): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const octave = Math.floor(index / SCALE_HZ.length);
  const degree = index % SCALE_HZ.length;
  const freq = SCALE_HZ[degree]! * 2 ** octave;
  const now = c.currentTime;
  const dur = 0.3;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  const shimmer = c.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(freq * 2, now);
  const shimmerGain = c.createGain();
  shimmerGain.gain.value = 0.07;
  const gain = outlet(c, 1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.24, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  shimmer.connect(shimmerGain).connect(gain);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  shimmer.start(now);
  shimmer.stop(now + dur + 0.02);
}

/** 読者アンケート結果が出そろったときの歓声。細かい拍手音の粒を時間差で重ねて群衆感を作る */
export function playCheer(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const total = 1.3;
  const claps = 42;
  for (let i = 0; i < claps; i++) {
    // 立ち上がりに密集させ、後半へ向けてまばらにすると「わっと沸いて引く」形になる
    const t0 = now + Math.random() ** 1.6 * total;
    const dur = 0.03 + Math.random() * 0.05;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.value = 1800 + Math.random() * 2500;
    const gain = outlet(c, 1);
    const peak = 0.05 + Math.random() * 0.05;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }
}
