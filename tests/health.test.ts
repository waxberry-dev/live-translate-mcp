import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock heavy native dependencies before any source imports
vi.mock('onnxruntime-node', () => ({
  default: {},
  InferenceSession: { create: vi.fn() },
  Tensor: vi.fn(),
}));

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
  env: { cacheDir: '' },
}));

const mockExistsSync = vi.hoisted(() => vi.fn<[string], boolean>());
const mockReaddirSync = vi.hoisted(() => vi.fn<[string], string[]>());
const mockAccessSync = vi.hoisted(() => vi.fn<[string, number?], void>());
const mockExecSync = vi.hoisted(() => vi.fn<[string], Buffer>());

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      readdirSync: mockReaddirSync,
      accessSync: mockAccessSync,
    },
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    accessSync: mockAccessSync,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: { ...actual, execSync: mockExecSync },
    execSync: mockExecSync,
  };
});

import { voicesExist } from '../src/tts.js';
import { isModelCached } from '../src/asr.js';
import { isBinaryAvailable } from '../src/binaries.js';

describe('voicesExist', () => {
  beforeEach(() => mockExistsSync.mockReset());

  it('returns true when both onnx model and json config exist for each voice', () => {
    mockExistsSync.mockReturnValue(true);
    expect(voicesExist()).toBe(true);
  });

  it('returns false when any voice model file is missing', () => {
    mockExistsSync
      .mockReturnValueOnce(false)  // first .onnx missing
      .mockReturnValue(true);
    expect(voicesExist()).toBe(false);
  });

  it('returns false when any voice config json is missing', () => {
    mockExistsSync
      .mockReturnValueOnce(true)   // .onnx present
      .mockReturnValueOnce(false)  // .json missing
      .mockReturnValue(true);
    expect(voicesExist()).toBe(false);
  });
});

describe('isModelCached', () => {
  beforeEach(() => mockReaddirSync.mockReset());

  it('returns true when the models directory contains a whisper entry', () => {
    mockReaddirSync.mockReturnValue(['whisper-base', 'other-model']);
    expect(isModelCached()).toBe(true);
  });

  it('returns false when the models directory has no whisper entry', () => {
    mockReaddirSync.mockReturnValue(['some-other-model']);
    expect(isModelCached()).toBe(false);
  });

  it('returns false when the models directory is missing or empty', () => {
    mockReaddirSync.mockReturnValue([]);
    expect(isModelCached()).toBe(false);
  });
});

describe('isBinaryAvailable', () => {
  beforeEach(() => {
    mockAccessSync.mockReset();
    mockExecSync.mockReset();
  });

  it('returns true when binary is found on PATH via which', () => {
    mockAccessSync.mockImplementation(() => { throw new Error('not found'); });
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/espeak-ng\n'));
    expect(isBinaryAvailable('espeak-ng')).toBe(true);
  });

  it('returns false when binary is absent from all search locations', () => {
    mockAccessSync.mockImplementation(() => { throw new Error('not found'); });
    mockExecSync.mockReturnValue(Buffer.from(''));
    expect(isBinaryAvailable('espeak-ng')).toBe(false);
  });

  it('returns true when binary exists in the cache dir', () => {
    mockAccessSync.mockReturnValueOnce(undefined); // cached binary is executable
    expect(isBinaryAvailable('espeak-ng')).toBe(true);
  });
});

describe('health_check status logic', () => {
  function computeStatus(whisper: boolean, voices: boolean, espeak: boolean) {
    const status = whisper && voices && espeak ? 'ok' : 'degraded';
    return {
      status,
      whisper: whisper ? 'ok' : 'missing — will download on first use',
      voices: voices ? 'ok' : 'missing — run: live-translate start',
      espeak_ng: espeak ? 'ok' : 'missing — install: brew install espeak-ng',
    };
  }

  it('reports ok when all components are present', () => {
    expect(computeStatus(true, true, true).status).toBe('ok');
  });

  it('reports degraded when Whisper model is missing', () => {
    const r = computeStatus(false, true, true);
    expect(r.status).toBe('degraded');
    expect(r.whisper).toContain('missing');
  });

  it('reports degraded when Piper voices are missing', () => {
    const r = computeStatus(true, false, true);
    expect(r.status).toBe('degraded');
    expect(r.voices).toContain('missing');
  });

  it('reports degraded when espeak-ng is missing', () => {
    const r = computeStatus(true, true, false);
    expect(r.status).toBe('degraded');
    expect(r.espeak_ng).toContain('missing');
  });

  it('includes remediation hints in each missing message', () => {
    const r = computeStatus(false, false, false);
    expect(r.whisper).toContain('download');
    expect(r.voices).toContain('live-translate');
    expect(r.espeak_ng).toContain('brew');
  });
});
