const WAV_HEADER_BYTES = 44;

export function wavBase64ToFloat32(b64: string): { samples: Float32Array; sampleRate: number } {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < WAV_HEADER_BYTES) {
    throw new Error('Invalid WAV: buffer too short');
  }

  const audioFormat = buf.readUInt16LE(20); // 1=PCM integer, 3=IEEE float
  const sampleRate = buf.readUInt32LE(24);
  const numChannels = buf.readUInt16LE(22);
  const bitsPerSample = buf.readUInt16LE(34);

  const bytesPerSample = bitsPerSample / 8;
  const pcmData = buf.slice(WAV_HEADER_BYTES);
  const numSamples = Math.floor(pcmData.length / bytesPerSample / numChannels);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const offset = i * bytesPerSample * numChannels;
    if (bitsPerSample === 16) {
      samples[i] = pcmData.readInt16LE(offset) / 32768.0;
    } else if (bitsPerSample === 32 && audioFormat === 3) {
      // 32-bit IEEE float
      samples[i] = pcmData.readFloatLE(offset);
    } else if (bitsPerSample === 32 && audioFormat === 1) {
      // 32-bit signed integer PCM (macOS CoreAudio default)
      samples[i] = pcmData.readInt32LE(offset) / 2147483648.0;
    } else {
      throw new Error(`Unsupported WAV format: ${bitsPerSample}-bit, audioFormat=${audioFormat}`);
    }
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
