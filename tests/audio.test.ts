import { describe, it, expect } from 'vitest';
import { extname } from 'node:path';
import { wavBase64ToFloat32, int16ToWavBase64 } from '../src/audio.js';

function makeWavBase64(samples: Int16Array, sampleRate = 16000): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i] ?? 0, 44 + i * 2);
  }

  return buf.toString('base64');
}

describe('wavBase64ToFloat32', () => {
  it('decodes a 16-bit PCM WAV to float32 samples in [-1, 1]', () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767, -32768]);
    const b64 = makeWavBase64(pcm, 16000);

    const { samples, sampleRate } = wavBase64ToFloat32(b64);

    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(pcm.length);
    expect(samples[0]).toBeCloseTo(0, 5);
    expect(samples[1]).toBeCloseTo(0.5, 2);
    expect(samples[2]).toBeCloseTo(-0.5, 2);
    expect(samples[3]).toBeCloseTo(1.0, 2);
    expect(samples[4]).toBeCloseTo(-1.0, 2);
  });

  it('preserves the sample rate from the WAV header', () => {
    const pcm = new Int16Array([0, 1000]);
    const b64 = makeWavBase64(pcm, 44100);

    const { sampleRate } = wavBase64ToFloat32(b64);
    expect(sampleRate).toBe(44100);
  });

  it('throws on invalid base64 (not a WAV)', () => {
    const notWav = Buffer.from('this is not a wav file').toString('base64');
    expect(() => wavBase64ToFloat32(notWav)).toThrow('Invalid WAV');
  });

  it('throws on truncated WAV with no data chunk', () => {
    // Only the RIFF/WAVE header, no fmt or data chunks
    const truncated = Buffer.alloc(12);
    truncated.write('RIFF', 0, 'ascii');
    truncated.writeUInt32LE(4, 4);
    truncated.write('WAVE', 8, 'ascii');

    expect(() => wavBase64ToFloat32(truncated.toString('base64'))).toThrow('Invalid WAV');
  });

  it('handles empty audio (zero samples) without throwing', () => {
    const empty = new Int16Array(0);
    const b64 = makeWavBase64(empty, 16000);

    const { samples } = wavBase64ToFloat32(b64);
    expect(samples.length).toBe(0);
  });
});

describe('int16ToWavBase64 → wavBase64ToFloat32 roundtrip', () => {
  it('encodes and decodes back to equivalent float32 samples', () => {
    const original = new Float32Array([0, 0.25, -0.25, 0.5, -0.5]);
    const pcm = new Int16Array(original.map(s => Math.round(s * 32767)));

    const b64 = int16ToWavBase64(pcm, 16000);
    const { samples, sampleRate } = wavBase64ToFloat32(b64);

    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(pcm.length);
    for (let i = 0; i < original.length; i++) {
      expect(samples[i]).toBeCloseTo(original[i] ?? 0, 2);
    }
  });
});

describe('output filename derivation', () => {
  function getOutputPath(filePath: string): string {
    const ext = extname(filePath);
    return ext ? filePath.slice(0, -ext.length) + '_translated.wav' : filePath + '_translated.wav';
  }

  it('appends _translated.wav before the extension', () => {
    expect(getOutputPath('/home/alice/meeting.wav')).toBe('/home/alice/meeting_translated.wav');
  });

  it('replaces any extension with _translated.wav', () => {
    expect(getOutputPath('/tmp/clip.mp3')).toBe('/tmp/clip_translated.wav');
  });

  it('appends _translated.wav when there is no extension', () => {
    expect(getOutputPath('/tmp/recording')).toBe('/tmp/recording_translated.wav');
  });

  it('handles paths with dots in directory names', () => {
    expect(getOutputPath('/home/user.name/file.wav')).toBe('/home/user.name/file_translated.wav');
  });
});
