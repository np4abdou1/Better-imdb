import iconv from 'iconv-lite';

function extractCharset(contentType?: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/charset=([^;]+)/i);
  if (!match?.[1]) return null;
  return match[1].trim().toLowerCase();
}

function scoreDecodedSubtitle(text: string): number {
  if (!text) return -9999;

  const cueMatches = text.match(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g);
  const cueCount = cueMatches ? cueMatches.length : 0;

  const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const replacementCount = (text.match(/�/g) || []).length;
  const mojibakeCount = (text.match(/[ØÙÃÂÐÑ]/g) || []).length;
  const mojibakeArabicBigrams =
    (text.match(/ط./g) || []).length +
    (text.match(/ظ./g) || []).length;

  const tahZahCount = (text.match(/[طظ]/g) || []).length;
  const tahZahRatio = arabicCount > 0 ? tahZahCount / arabicCount : 0;

  const commonArabicWordHits =
    (text.match(/\b(ال|في|من|على|هذا|هذه|أنا|إلى|ما|لا)\b/g) || []).length;

  let score = 0;
  score += cueCount * 30;
  score += arabicCount * 2;
  score -= replacementCount * 20;
  score -= mojibakeCount * 6;
  score -= mojibakeArabicBigrams * 5;

  if (tahZahRatio > 0.24) {
    score -= 220;
  }

  score += commonArabicWordHits * 12;

  if (text.includes('WEBVTT')) score += 40;

  return score;
}

function decodeWithEncoding(buffer: Buffer, encoding: string): string {
  const normalized = encoding.toLowerCase();
  if (iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, normalized);
  }

  const decoder = new TextDecoder(normalized as any, { fatal: false });
  return decoder.decode(buffer);
}

function repairCommonMojibake(text: string): string {
  if (!text) return text;

  const hasMojibake = /[ØÙÃÂÐÑ]/.test(text) || ((text.match(/ط./g) || []).length > 4 && (text.match(/ظ./g) || []).length > 2);
  const hasArabic = /[\u0600-\u06FF]/.test(text);

  if (!hasMojibake) {
    return text;
  }

  const candidates: string[] = [text];

  try {
    candidates.push(Buffer.from(text, 'latin1').toString('utf8'));
  } catch {}

  try {
    candidates.push(iconv.decode(iconv.encode(text, 'windows-1256'), 'utf8'));
  } catch {}

  try {
    candidates.push(iconv.decode(iconv.encode(text, 'windows-1252'), 'utf8'));
  } catch {}

  if (!hasArabic) {
    return candidates.sort((a, b) => scoreDecodedSubtitle(b) - scoreDecodedSubtitle(a))[0] || text;
  }

  return candidates.sort((a, b) => scoreDecodedSubtitle(b) - scoreDecodedSubtitle(a))[0] || text;
}

export function decodeSubtitleBuffer(buffer: Buffer, contentType?: string | null): string {
  const charset = extractCharset(contentType);
  const candidates = [
    charset,
    'utf-8',
    'utf8',
    'windows-1256',
    'cp1256',
    'iso-8859-6',
    'windows-1252',
    'cp1252',
    'iso-8859-1',
    'latin1'
  ].filter(Boolean) as string[];

  let bestText = buffer.toString('utf8');
  let bestScore = scoreDecodedSubtitle(bestText);

  for (const enc of candidates) {
    try {
      const decoded = decodeWithEncoding(buffer, enc);
      const repaired = repairCommonMojibake(decoded);
      const score = scoreDecodedSubtitle(repaired);
      if (score > bestScore) {
        bestScore = score;
        bestText = repaired;
      }
    } catch {
      // Unsupported encoding in runtime - skip
    }
  }

  return bestText.replace(/^\uFEFF/, '');
}
