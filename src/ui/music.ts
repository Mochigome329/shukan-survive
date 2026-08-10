/**
 * BGM（v7.34）。
 *
 * SFX（audio.ts）と同じ共有AudioContext上で、intro→loopをつなげて画面をまたいで流し続ける。
 * イントロ（原曲冒頭の静かな入り、約8秒）を1回だけ再生したあと、
 * ループ本編（tail/headをクロスフェードして継ぎ目を作った約33.5秒）へ引き継いで無限ループする。
 * リザルト画面のカットイン中だけ音量を下げる（ダッキング）。
 *
 * SFXと同じく、最初の再生は必ずユーザーの操作（タップ）の中から起動すること
 * （ブラウザの自動再生制限。iOS Safariは特に厳しい）
 */
import bgmIntroUrl from '../assets/bgm-intro.mp3';
import bgmLoopUrl from '../assets/bgm-loop.mp3';
import { getCtx, isMuted } from './audio';

const NORMAL_GAIN = 0.35;
const DUCK_GAIN = 0.08;
const RAMP_SEC = 0.25;

let started = false;
let musicGain: GainNode | null = null;
let ducked = false;

async function loadBuffer(c: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  const bytes = await res.arrayBuffer();
  return c.decodeAudioData(bytes);
}

function applyGain(): void {
  const c = getCtx();
  if (!c || !musicGain) return;
  const target = isMuted() ? 0 : ducked ? DUCK_GAIN : NORMAL_GAIN;
  musicGain.gain.cancelScheduledValues(c.currentTime);
  musicGain.gain.linearRampToValueAtTime(target, c.currentTime + RAMP_SEC);
}

function playLoop(c: AudioContext, buffer: AudioBuffer): void {
  if (!musicGain) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(musicGain);
  src.start();
}

/**
 * 最初のユーザー操作の中から一度だけ呼ぶ（App.tsxの初回タップで起動）。
 * 2回目以降の呼び出しは何もしない
 */
export function startMusic(): void {
  if (started) return;
  started = true;
  const c = getCtx();
  if (!c) return;

  musicGain = c.createGain();
  musicGain.gain.value = isMuted() ? 0 : NORMAL_GAIN;
  musicGain.connect(c.destination);

  void Promise.all([loadBuffer(c, bgmIntroUrl), loadBuffer(c, bgmLoopUrl)])
    .then(([intro, loop]) => {
      const introSrc = c.createBufferSource();
      introSrc.buffer = intro;
      introSrc.connect(musicGain!);
      introSrc.onended = () => playLoop(c, loop);
      introSrc.start();
    })
    .catch(() => {
      // デコード失敗（対応形式でない等）は無音のまま諦める。SFXと同じく致命的にはしない
    });
}

/** SoundToggleのミュート切り替えと連動させる */
export function syncMusicVolume(): void {
  applyGain();
}

/** リザルト画面のカットイン中に音量を下げる */
export function duckMusic(): void {
  ducked = true;
  applyGain();
}

/** ダッキング解除 */
export function unduckMusic(): void {
  ducked = false;
  applyGain();
}
