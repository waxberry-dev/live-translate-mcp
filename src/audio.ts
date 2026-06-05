const WAV_HEADER_BYTES = 44;

export function wavBase64ToFloat32(b64: string): { samples: Float32Array; sampleRate: number } {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < WAV_HEADER_BYTES) {
    throw new Error('Invalid WAV: buffer too short');
  }

  const sampleRate = buf.readUInt32LE(24);
  const numChannels = buf.readUInt16LE(22);
  const bitsPerSample = buf.readUInt16LE(34);

  if (bitsPerSample !== 16) {
    throw new Error(`Invalid WAV: expected 16-bit PCM, got ${bitsPerSample}-bit`);
  }

  const pcmData = buf.slice(WAV_HEADER_BYTES);
  const numSamples = Math.floor(pcmData.length / 2 / numChannels);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    // Read first channel only (mono or left channel of stereo)
    const int16 = pcmData.readInt16LE(i * 2 * numChannels);
    samples[i] = int16 / 32768.0;
  }

  return { samples, sampleRate };
}

export function int16ToWavBase64(pcm: Int16Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length * 2;
  const headerSize = WAV_HEADER_BYTES;
  const fileSize = headerSize + dataSize;

  const buf = Buffer.alloc(fileSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(fileSize - 8, 4);
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

  for (let i = 0; i < pcm.length; i++) {
    buf.writeInt16LE(pcm[i] ?? 0, WAV_HEADER_BYTES + i * 2);
  }

  return buf.toString('base64');
}
