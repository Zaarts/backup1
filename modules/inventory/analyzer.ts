
import { DNAProfile } from '../../types';

const findStartIdx = (data: Float32Array, threshold = 0.02): number => {
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) return i;
  }
  return 0;
};

const normalizeBuffer = (data: Float32Array): Float32Array => {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > max) max = abs;
  }
  if (max === 0) return data;
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) result[i] = data[i] / max;
  return result;
};

const estimateFundamental = (data: Float32Array, startIdx: number, sampleRate: number): { freq: number, score: number } => {
  const windowMs = 100; // Только первые 100мс
  const windowSamples = Math.floor(sampleRate * (windowMs / 1000));
  const segment = data.slice(startIdx, startIdx + Math.min(windowSamples, data.length - startIdx));
  
  if (segment.length < 512) return { freq: 0, score: 0 };

  const searchMin = Math.floor(sampleRate / 500); 
  const searchMax = Math.floor(sampleRate / 25);  
  
  let bestOffset = 0;
  let maxCorr = -Infinity;
  let secondCorr = -Infinity;

  for (let offset = searchMin; offset < searchMax; offset++) {
    let corr = 0;
    for (let i = 0; i < Math.min(2048, segment.length - offset); i++) {
      corr += segment[i] * segment[i + offset];
    }
    if (offset >= Math.floor(sampleRate/90) && offset <= Math.floor(sampleRate/30)) corr *= 2.0;

    if (corr > maxCorr) { secondCorr = maxCorr; maxCorr = corr; bestOffset = offset; }
    else if (corr > secondCorr) { secondCorr = corr; }
  }

  const freq = bestOffset > 0 ? sampleRate / bestOffset : 0;
  return { freq: (freq < 20 || freq > 1100) ? 0 : freq, score: maxCorr / (secondCorr || 1) };
};

export const analyzeAudioBuffer = async (buffer: AudioBuffer, sourceTags: string[], semantic: { isLocked: boolean, masterCategory?: string }): Promise<{ dna: DNAProfile, confidence: number }> => {
  let data = buffer.getChannelData(0);
  data = normalizeBuffer(data);
  const sampleRate = buffer.sampleRate;
  const startIdx = findStartIdx(data, 0.05);
  const trimmed = data.slice(startIdx);

  if (trimmed.length < 512) return { dna: { peakFrequency: 0, spectralCentroid: 0, attackMs: 0, decayMs: 0, zeroCrossingRate: 0, brightness: 0 }, confidence: 0 };

  // Атака
  let peakIdx = 0; let maxAmp = 0;
  const atkLimit = Math.min(trimmed.length, Math.floor(sampleRate * 0.1));
  for (let i = 0; i < atkLimit; i++) {
    const a = Math.abs(trimmed[i]);
    if (a > maxAmp) { maxAmp = a; peakIdx = i; }
  }
  const attackMs = (peakIdx / sampleRate) * 1000;

  // Частота
  const { freq } = estimateFundamental(data, startIdx, sampleRate);

  // Яркость
  let crossings = 0;
  const zcrSize = Math.min(trimmed.length, Math.floor(sampleRate * 0.05));
  for (let i = 1; i < zcrSize; i++) if ((trimmed[i]>0 && trimmed[i-1]<=0) || (trimmed[i]<0 && trimmed[i-1]>=0)) crossings++;
  const brightness = Math.min((crossings / zcrSize) * 6, 1);

  // НОВАЯ МАТЕМАТИКА УВЕРЕННОСТИ
  let confidence = semantic.isLocked ? 100 : 10;
  if (!semantic.isLocked && freq > 0) confidence = 80;

  return {
    dna: { peakFrequency: freq, spectralCentroid: 0, attackMs, decayMs: 0, zeroCrossingRate: crossings/zcrSize, brightness },
    confidence
  };
};

export const getAcousticValidation = (dna: DNAProfile, masterCategory?: string, confidence?: number): string[] => {
  const tags: string[] = [];
  const freq = dna.peakFrequency;

  if (confidence === 10) tags.push('#Unclassified');
  if (freq === 0 && dna.brightness < 0.05) { tags.push('#Silent'); return tags; }

  // Зонирование (Анализатор — слуга семантики)
  if (freq > 0 && freq < 160) {
    if (!masterCategory) tags.push('#SubRange');
    if (dna.zeroCrossingRate > 0.35) tags.push('#Grit');
  } else if (dna.brightness > 0.75) {
    // Если категория залочена как Kick/Bass, мы НЕ вешаем Hat. Только если категория свободна.
    if (masterCategory !== 'Kick' && masterCategory !== 'Bass') tags.push('#Hat');
  }

  if (dna.attackMs < 12) tags.push('#Tight');
  
  return tags;
};
