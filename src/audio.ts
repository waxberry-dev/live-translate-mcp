const WAV_FORMAT_PCM = 1;
const WAV_FORMAT_FLOAT = 3;
const WAV_FORMAT_EXTENSIBLE = 0xFFFE;

export function wavBase64ToFloat32(b64: string): { samples: Float32Array; sampleRate: number } {
  const buf = Buffer.from(b64, 'base64');

  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV: not a RIFF/WAVE file');
  }

  // Walk chunks to find fmt and data — handles WAVE_FORMAT_EXTENSIBLE and fact chunks
  let audioFormat = 0;
  let numChannels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkId === 'fmt ') {
      audioFormat = buf.readUInt16LE(offset);
      numChannels = buf.readUInt16LE(offset + 2);
      sampleRate = buf.readUInt32LE(offset + 4);
      bitsPerSample = buf.readUInt16LE(offset + 14);

      // WAVE_FORMAT_EXTENSIBLE stores the real format in a SubFormat GUID at offset+24
      if (audioFormat === WAV_FORMAT_EXTENSIBLE && chunkSize >= 40) {
        audioFormat = buf.readUInt16LE(offset + 24);
      }
    } else if (chunkId === 'data') {
      dataOffset = offset;
      dataSize = chunkSize;
      break;
    }

    offset += chunkSize + (chunkSize & 1); // chunks are word-aligned
  }

  if (dataOffset === -1) throw new Error('Invalid WAV: no data chunk found');

  const bytesPerSample = bitsPerSample / 8;
  const pcmData = buf.slice(dataOffset, dataOffset + dataSize);
  const numSamples = Math.floor(pcmData.length / bytesPerSample / numChannels);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const off = i * bytesPerSample * numChannels;
    if (bitsPerSample === 16 && audioFormat === WAV_FORMAT_PCM) {
      samples[i] = pcmData.readInt16LE(off) / 32768.0;
    } else if (bitsPerSample === 32 && audioFormat === WAV_FORMAT_FLOAT) {
      samples[i] = pcmData.readFloatLE(off);
    } else if (bitsPerSample === 32 && audioFormat === WAV_FORMAT_PCM) {
      samples[i] = pcmData.readInt32LE(off) / 2147483648.0;
    } else {
      throw new Error(`Unsupported WAV format: ${bitsPerSample}-bit audioFormat=${audioFormat}`);
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
  const headerSize = 44;
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
    buf.writeInt16LE(pcm[i] ?? 0, 44 + i * 2);
  }

  return buf.toString('base64');
}
