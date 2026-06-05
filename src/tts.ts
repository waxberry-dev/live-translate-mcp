import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as ort from 'onnxruntime-node';
import { resolveBinary, isBinaryAvailable } from './binaries.js';
import { int16ToWavBase64 } from './audio.js';

const execFileAsync = promisify(execFile);

const VOICE_DIR = process.env['PIPER_VOICE_DIR'] ?? path.join(os.homedir(), '.live-translate', 'voices');

const LANGUAGE_VOICE_MAP: Record<string, string> = {
  en: 'en_US-lessac-medium.onnx',
  zh: 'zh_CN-huayan-medium.onnx',
};

// zh_CN-huayan speaks fast at the model's default — 1.2 brings it to a natural pace
const LANGUAGE_LENGTH_SCALE: Record<string, number> = {
  zh: 1.2,
};

interface VoiceConfig {
  sample_rate: number;
  espeak_voice: string;
  phoneme_id_map: Record<string, number[]>;
  noise_scale: number;
  length_scale: number;
  noise_w: number;
  bos: string | null;
  eos: string | null;
  pad: string | null;
}

interface PiperVoice {
  session: ort.InferenceSession;
  config: VoiceConfig;
}

function loadVoiceConfig(configPath: string): VoiceConfig {
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    audio: { sample_rate: number };
    espeak: { voice: string };
    phoneme_id_map: Record<string, number[]>;
    inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
    bos?: string;
    eos?: string;
    pad?: string;
  };

  const inference = data.inference ?? {};
  return {
    sample_rate: data.audio.sample_rate,
    espeak_voice: data.espeak.voice,
    phoneme_id_map: data.phoneme_id_map,
    noise_scale: inference.noise_scale ?? 0.667,
    length_scale: inference.length_scale ?? 1.0,
    noise_w: inference.noise_w ?? 0.8,
    bos: data.bos ?? '^',
    eos: data.eos ?? '$',
    pad: data.pad ?? '_',
  };
}

async function loadVoices(): Promise<Record<string, PiperVoice>> {
  const loaded: Record<string, PiperVoice> = {};
  for (const [lang, filename] of Object.entries(LANGUAGE_VOICE_MAP)) {
    const modelPath = path.join(VOICE_DIR, filename);
    const configPath = path.join(VOICE_DIR, `${filename}.json`);
    if (!fs.existsSync(modelPath) || !fs.existsSync(configPath)) continue;
    const config = loadVoiceConfig(configPath);
    if (lang in LANGUAGE_LENGTH_SCALE) config.length_scale = LANGUAGE_LENGTH_SCALE[lang]!;
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
    loaded[lang] = { session, config };
  }
  return loaded;
}

let _voices: Record<string, PiperVoice> | null = null;
let _espeakBin: string | null = null;

async function getVoices(): Promise<Record<string, PiperVoice>> {
  if (!_voices) _voices = await loadVoices();
  return _voices;
}

async function getEspeakBin(): Promise<string> {
  if (!_espeakBin) _espeakBin = await resolveBinary('espeak-ng');
  return _espeakBin;
}

function textToPhonemeIds(ipa: string, config: VoiceConfig): number[] {
  const ids: number[] = [];

  if (config.bos && config.phoneme_id_map[config.bos]) {
    ids.push(...(config.phoneme_id_map[config.bos] ?? []));
  }

  for (const char of ipa) {
    if (!(char in config.phoneme_id_map)) continue;
    ids.push(...(config.phoneme_id_map[char] ?? []));
    if (config.pad && config.phoneme_id_map[config.pad]) {
      ids.push(...(config.phoneme_id_map[config.pad] ?? []));
    }
  }

  if (config.eos && config.phoneme_id_map[config.eos]) {
    ids.push(...(config.phoneme_id_map[config.eos] ?? []));
  }

  return ids;
}

async function phonemize(text: string, espeakVoice: string): Promise<string> {
  const bin = await getEspeakBin();
  const { stdout, stderr } = await execFileAsync(
    bin,
    ['-v', espeakVoice, '--ipa', '-q', '--', text],
    { timeout: 30_000 },
  );
  if (stderr.trim()) throw new Error(`espeak-ng error: ${stderr.trim()}`);
  return stdout.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
}

async function infer(session: ort.InferenceSession, ids: number[], config: VoiceConfig): Promise<Int16Array> {
  if (ids.length === 0) return new Int16Array(1);

  const input = new ort.Tensor('int64', BigInt64Array.from(ids.map(n => BigInt(n))), [1, ids.length]);
  const input_lengths = new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]);
  const scales = new ort.Tensor('float32', Float32Array.from([config.noise_scale, config.length_scale, config.noise_w]), [3]);

  const output = await session.run({ input, input_lengths, scales });
  const audioFloat = output['output']?.data as Float32Array;
  if (!audioFloat) throw new Error('ONNX inference produced no output');

  let maxAbs = 0;
  for (let i = 0; i < audioFloat.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(audioFloat[i] ?? 0));
  }
  const scale = 32767.0 / Math.max(maxAbs, 0.01);
  const pcm = new Int16Array(audioFloat.length);
  for (let i = 0; i < audioFloat.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round((audioFloat[i] ?? 0) * scale)));
  }
  return pcm;
}

export async function synthesize(text: string, language: 'en' | 'zh'): Promise<string> {
  const voices = await getVoices();
  const voice = voices[language];
  if (!voice) throw new Error(`No voice loaded for language '${language}'. Run live-translate start to download voices.`);

  const ipa = await phonemize(text, voice.config.espeak_voice);
  const ids = textToPhonemeIds(ipa, voice.config);
  const pcm = await infer(voice.session, ids, voice.config);
  return int16ToWavBase64(pcm, voice.config.sample_rate);
}

export function voicesExist(): boolean {
  return Object.values(LANGUAGE_VOICE_MAP).every(filename => {
    return fs.existsSync(path.join(VOICE_DIR, filename)) &&
           fs.existsSync(path.join(VOICE_DIR, `${filename}.json`));
  });
}

export { isBinaryAvailable };
