import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';
import { wavBase64ToFloat32 } from './audio.js';

env.cacheDir = path.join(os.homedir(), '.live-translate', 'models');

const MODEL = 'onnx-community/whisper-base';

interface TranscriberFn {
  (input: Float32Array, options: Record<string, unknown>): Promise<unknown>;
}

let _transcriber: TranscriberFn | null = null;

async function getTranscriber(): Promise<TranscriberFn> {
  if (!_transcriber) {
    _transcriber = await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' }) as unknown as TranscriberFn;
  }
  return _transcriber;
}

type PipelineInternals = {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
  model: {
    generate: (opts: Record<string, unknown>) => Promise<{ 0: { tolist: () => bigint[] } }>;
    generation_config: {
      decoder_start_token_id: number;
      is_multilingual: boolean | null;
      lang_to_id: Record<string, number> | null;
    };
  };
};

// Runs a single decoder probe step to read Whisper's built-in language token prediction.
// Transformers.js v3 left this as a TODO and silently defaults to English; we fill the gap.
async function detectAudioLanguage(samples: Float32Array): Promise<'en' | 'zh'> {
  const pipe = (await getTranscriber()) as unknown as PipelineInternals;
  const { is_multilingual, decoder_start_token_id, lang_to_id } = pipe.model.generation_config;

  if (!is_multilingual || !lang_to_id) return 'en';

  const { input_features } = await pipe.processor(samples);

  // Passing decoder_input_ids bypasses _retrieve_init_tokens (which hard-codes English).
  // max_new_tokens: 1 → the single generated token is Whisper's language prediction.
  const output = await pipe.model.generate({
    inputs: input_features,
    decoder_input_ids: [decoder_start_token_id],
    max_new_tokens: 1,
    do_sample: false,
  });

  const langTokenId = Number(output[0].tolist()[1]);
  return langTokenId === lang_to_id['<|zh|>'] ? 'zh' : 'en';
}

export async function transcribe(audioBase64: string): Promise<{ text: string; language: 'en' | 'zh' }> {
  const asr = await getTranscriber();
  const { samples } = wavBase64ToFloat32(audioBase64);
  const language = await detectAudioLanguage(samples);

  const result = await asr(samples, {
    language: language === 'zh' ? 'chinese' : 'english',
    task: 'transcribe',
  });
  const output = Array.isArray(result) ? result[0] : result;
  const text = (output as { text: string }).text?.trim() ?? '';

  return { text, language };
}

export function isModelCached(): boolean {
  try {
    return fs.readdirSync(path.join(os.homedir(), '.live-translate', 'models'))
      .some(e => e.includes('whisper'));
  } catch {
    return false;
  }
}
