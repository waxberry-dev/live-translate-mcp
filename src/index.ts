#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { transcribe } from './asr.js';
import { synthesize, voicesExist, isBinaryAvailable } from './tts.js';
import { translateText } from './translate.js';

function playFile(filePath: string): Promise<void> {
  const [cmd, ...args] =
    process.platform === 'darwin'
      ? ['afplay', filePath]
      : ['aplay', '-q', filePath];
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    proc.on('error', reject);
  });
}

async function runPipeline(audioBase64: string): Promise<{
  original_text: string;
  detected_language: 'en' | 'zh';
  translated_text: string;
  target_language: 'en' | 'zh';
  audio_base64: string;
}> {
  const { text, language } = await transcribe(audioBase64);
  if (!text) throw new Error('No speech detected in audio');
  const targetLang: 'en' | 'zh' = language === 'en' ? 'zh' : 'en';
  const translatedText = await translateText(text, language, targetLang);
  const outputAudio = await synthesize(translatedText, targetLang);
  return {
    original_text: text,
    detected_language: language,
    translated_text: translatedText,
    target_language: targetLang,
    audio_base64: outputAudio,
  };
}

const server = new Server(
  { name: 'live-translate-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'translate_file',
      description:
        'Translate a speech audio file between English and Mandarin Chinese. ' +
        'Pass an absolute path to a WAV file. Automatically detects the input language and translates to the other. ' +
        'Saves the translated audio next to the source file and plays it. Returns original text and translation.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to a WAV audio file (16 kHz, mono, 16-bit recommended)',
          },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'translate_speech',
      description:
        'Translate speech audio between English and Mandarin Chinese. ' +
        'Automatically detects the input language and translates to the other. ' +
        'Returns original text, translation, and synthesised audio as base64-encoded WAV.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          audio_base64: {
            type: 'string',
            description: 'Base64-encoded WAV audio (16 kHz, mono, 16-bit recommended)',
          },
          sample_rate: {
            type: 'number',
            description: 'Sample rate of the input audio in Hz (default: 16000)',
          },
        },
        required: ['audio_base64'],
      },
    },
    {
      name: 'health_check',
      description:
        'Check whether all live-translate-mcp dependencies are available: Whisper model cache, Piper voice files, and espeak-ng binary.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'translate_file') {
    const filePath = typeof args['file_path'] === 'string' ? args['file_path'] : null;

    if (!filePath) {
      return { isError: true, content: [{ type: 'text' as const, text: 'file_path is required' }] };
    }

    let audioBase64: string;
    try {
      const bytes = await readFile(filePath);
      audioBase64 = bytes.toString('base64');
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Could not read file "${filePath}": ${String(err)}` }],
      };
    }

    try {
      const result = await runPipeline(audioBase64);
      const ext = extname(filePath);
      const outputPath = ext ? filePath.slice(0, -ext.length) + '_translated.wav' : filePath + '_translated.wav';
      await writeFile(outputPath, Buffer.from(result.audio_base64, 'base64'));
      await playFile(outputPath);

      return {
        content: [{
          type: 'text' as const,
          text: `Original (${result.detected_language}): ${result.original_text}\nTranslation (${result.target_language}): ${result.translated_text}\nSaved to: ${outputPath} (played)`,
        }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Translation failed: ${String(err)}` }],
      };
    }
  }

  if (name === 'translate_speech') {
    const audioBase64 = typeof args['audio_base64'] === 'string' ? args['audio_base64'] : null;

    if (!audioBase64) {
      return { isError: true, content: [{ type: 'text' as const, text: 'audio_base64 is required' }] };
    }

    try {
      const result = await runPipeline(audioBase64);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Translation failed: ${String(err)}` }],
      };
    }
  }

  if (name === 'health_check') {
    const voices = voicesExist();
    const espeak = isBinaryAvailable('espeak-ng');

    const status = voices && espeak ? 'ok' : 'degraded';
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status,
          voices: voices ? 'ok' : 'missing — run: live-translate start',
          espeak_ng: espeak ? 'ok' : 'missing — install: brew install espeak-ng',
        }, null, 2),
      }],
    };
  }

  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
