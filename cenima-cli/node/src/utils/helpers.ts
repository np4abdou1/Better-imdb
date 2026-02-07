import { unescape } from 'querystring';

export function cleanText(text: string | null | undefined): string {
    if (!text) return "";
    return text.trim().replace(/\s+/g, " ");
}

export function cleanArabicTitle(text: string | null | undefined): string {
    if (!text) return "";
    
    // Remove arabic unicode range
    let cleaned = text.replace(/[\u0600-\u06FF]+/g, '');
    
    const parts = cleaned.split(/\s+/);
    const seenNumbers = new Set<string>();
    const cleanedParts: string[] = [];
    
    for (const part of parts) {
        if (/^\d+$/.test(part)) {
            if (!seenNumbers.has(part)) {
                cleanedParts.push(part);
                seenNumbers.add(part);
            }
        } else {
            cleanedParts.push(part);
        }
    }
    
    cleaned = cleanedParts.join(' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned.trim();
}

export function parseEpisodeNumber(epStr: string | null | undefined): number {
    if (!epStr) return 99999.0;
    
    const str = String(epStr).trim();
    
    if (str.toLowerCase() === "special" || str === "0") return 0.0;
    
    const match = str.match(/(\d+(?:\.\d+)?)/);
    if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) return val;
    }
    
    return 99999.0;
}

export function extractSeasonNumber(text: string): number {
    // Decode first
    try {
        text = decodeURIComponent(text);
    } catch (e) {
        // ignore error
    }
    
    const textLower = text.toLowerCase();
    const textNormalized = textLower.replace(/-/g, ' ').replace(/_/g, ' ');
    
    if (textNormalized.includes('final') || textNormalized.includes('نهائي') || textNormalized.includes('الأخير')) {
        const partMatch = textNormalized.match(/(?:part|الجزء|جزء)[- ]?(\d+)/);
        if (partMatch) {
            return 100 + parseInt(partMatch[1], 10);
        }
        return 100;
    }
    
    const arabicOrdinals: Record<string, number> = {
        'الحادي عشر': 11, 'حادي عشر': 11,
        'الثاني عشر': 12, 'ثاني عشر': 12,
        'الثالث عشر': 13, 'ثالث عشر': 13,
        'الرابع عشر': 14, 'رابع عشر': 14,
        'الخامس عشر': 15, 'خامس عشر': 15,
        'السادس عشر': 16, 'سادس عشر': 16,
        'السابع عشر': 17, 'سابع عشر': 17,
        'الثامن عشر': 18, 'ثامن عشر': 18,
        'التاسع عشر': 19, 'تاسع عشر': 19,
        'الحادي والعشرون': 21, 'حادي والعشرون': 21,
        'الثاني والعشرون': 22, 'ثاني والعشرون': 22,
        'العشرون': 20, 'عشرون': 20,
        'العاشر': 10, 'عاشر': 10,
        'التاسع': 9, 'تاسع': 9,
        'الثامن': 8, 'ثامن': 8,
        'السابع': 7, 'سابع': 7,
        'السادس': 6, 'سادس': 6,
        'الخامس': 5, 'خامس': 5,
        'الرابع': 4, 'رابع': 4,
        'الثالث': 3, 'ثالث': 3,
        'الثاني': 2, 'ثاني': 2,
        'الاول': 1, 'الأول': 1, 'اول': 1,
    };
    
    // Check arabic ordinals
    const sortedKeys = Object.keys(arabicOrdinals).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (textNormalized.includes(key)) {
            return arabicOrdinals[key];
        }
    }
    
    const match = textNormalized.match(/(?:الموسم|season)[- ]?(\d+)|(?:^|\/)s(\d+)(?:$|\/)/);
    if (match) {
        if (match[1]) return parseInt(match[1], 10);
        if (match[2]) return parseInt(match[2], 10);
    }
    
    return 1;
}

export function extractSeasonPart(text: string): string | null {
    try {
        text = decodeURIComponent(text).toLowerCase();
    } catch (e) {
        text = text.toLowerCase();
    }

    const partMatch = text.match(/(?:part|الجزء|جزء)[- ]?(\d+)|p(\d+)/i);
    if (partMatch) {
        const num = partMatch[1] || partMatch[2];
        return `Part ${num}`;
    }
    
    if (text.includes('الجزء الثاني') || text.includes('part 2') || text.includes('cour 2')) {
        return "Part 2";
    } else if (text.includes('الجزء الاول') || text.includes('part 1') || text.includes('cour 1')) {
        return "Part 1";
    }
    
    return null;
}

export function cleanShowTitle(title: string): string {
    let cleaned = cleanArabicTitle(title);
    
    if (cleaned.toLowerCase() === 'topcinema') return "";
    
    const junkPatterns = [
        /\b(?:1080p|720p|480p|360p)\b/gi,
        /\b(?:WEB-DL|BluRay|HDTV|CAM)\b/gi,
        /\b(?:x264|x265|HEVC)\b/gi,
        /\b(?:\d{1,2}\.\d)\b/g,
        /[★⭐]\s*\d+\.?\d*/g,
        /\[\s*\d+\.?\d*\s*\]/g,
        /\b(?:Season|الموسم)\s*\d+/gi,
        /\b(?:Episode|الحلقة)\s*\d+/gi,
    ];
    
    for (const pattern of junkPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}
