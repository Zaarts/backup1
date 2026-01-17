
import { BRAND_DICTIONARY, GENRE_NORMALIZER } from '../../constants';

const FINAL_MAP: Record<string, string> = {
  'BD': 'Kick', 'KICK': 'Kick',
  'BASS': 'Bass', 'BS': 'Bass', 'SUB': 'Bass',
  'HAT': 'Hat', 'OH': 'Hat', 'CH': 'Hat', 'CYM': 'Hat', 'HH': 'Hat',
  'SNRE': 'Snare', 'SNARE': 'Snare', 'SNR': 'Snare',
  'SEQ': 'Sequence', 'SEQUENCE': 'Sequence', 'LOOP': 'Loop',
  'VOCAL': 'Vocal', 'VOX': 'Vocal', 'VOICE': 'Vocal'
};

export const normalizeTags = (path: string, fileName: string): { 
  tags: string[], 
  confidence: number, 
  isLocked: boolean,
  masterCategory?: string
} => {
  const fullPath = `${path}/${fileName}`.toUpperCase();
  const tags = new Set<string>();
  let isLocked = false;
  let masterCategory: string | undefined;

  // 1. СТРОГИЙ СЕМАНТИЧЕСКИЙ АНАЛИЗ (FINAL_MAP)
  // Мы ищем токены, окруженные спецсимволами или началом/концом строки, чтобы избежать ложных срабатываний
  const tokens = fullPath.split(/[\/\\_\-\s\.]/);
  
  for (const token of tokens) {
    if (FINAL_MAP[token]) {
      masterCategory = FINAL_MAP[token];
      tags.add(`#${masterCategory}`);
      isLocked = true;
      break; // Нашли основной закон, выходим
    }
  }

  // Если не нашли в токенах, ищем прямое вхождение (на случай слитых имен типа "KICK01")
  if (!isLocked) {
    for (const [key, value] of Object.entries(FINAL_MAP)) {
      if (fullPath.includes(key)) {
        masterCategory = value;
        tags.add(`#${masterCategory}`);
        isLocked = true;
        break;
      }
    }
  }

  // 2. Бренды и Жанры (Вспомогательная информация)
  tokens.forEach(p => {
    if (BRAND_DICTIONARY[p]) tags.add(`#${BRAND_DICTIONARY[p].replace(/\s/g, '_')}`);
    if (GENRE_NORMALIZER[p]) tags.add(`#${GENRE_NORMALIZER[p].replace(/\s/g, '_')}`);
  });

  return {
    tags: Array.from(tags),
    confidence: isLocked ? 100 : 10,
    isLocked,
    masterCategory
  };
};
