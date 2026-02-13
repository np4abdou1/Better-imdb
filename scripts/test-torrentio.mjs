import { gotScraping } from 'got-scraping';

const DEFAULT_CASES = [
  { type: 'movie', id: 'tt30472557', label: 'Chainsaw Man Reze Arc' },
  { type: 'movie', id: 'tt1375666', label: 'Inception' },
  { type: 'series', id: 'tt0944947:1:1', label: 'Game of Thrones S01E01' },
  { type: 'series', id: 'tt0903747:1:1', label: 'Breaking Bad S01E01' },
];

function classify(title) {
  const t = String(title || '').toLowerCase();

  const hasAac = /\baac\b|\baac2\.0\b|\baac 2\.0\b/i.test(t);
  const hasOpus = /\bopus\b/i.test(t);
  const hasAc3 = /\bac3\b(?!\+)/i.test(t);
  const hasEac3 = /\beac3\b|\bddp\b|\bdd\+\b|dolby\s*digital\s*plus/i.test(t);
  const hasDts = /\bdts\b|dtshd/i.test(t);
  const hasTrueHd = /\btruehd\b/i.test(t);
  const hasDual = /dual[-\s]?audio|multi[-\s]?audio|multiple\s+audio/i.test(t);
  const hasHevc = /x265|h\.?265|hevc/i.test(t);
  const hasAv1 = /\bav1\b/i.test(t);
  const hasH264 = /x264|h\.?264|\bavc\b/i.test(t);
  const hasFlags = /🇬🇧|🇯🇵|🇮🇹|🇫🇷|🇩🇪|🇪🇸|🇲🇽|🇷🇺|🇰🇷|🇨🇳|🇧🇷|🇵🇹|🇸🇦|🇪🇬/.test(t);

  const compatibleAudio = hasAac || hasOpus || hasAc3;
  const riskyAudio = hasEac3 || hasDts || hasTrueHd;

  return {
    compatibleAudio,
    riskyAudio,
    hasDual,
    hasHevc,
    hasAv1,
    hasH264,
    hasFlags,
  };
}

async function runCase(testCase) {
  const url = `https://torrentio.strem.fun/stream/${testCase.type}/${testCase.id}.json`;
  const res = await gotScraping(url, {
    responseType: 'json',
    timeout: { request: 25000 },
  });

  const streams = res.body?.streams || [];
  const sample = streams.slice(0, 20).map((stream) => {
    const title = String(stream.title || '').replace(/\n/g, ' | ');
    const cls = classify(title);
    return { title, cls };
  });

  const stats = {
    total: streams.length,
    sample: sample.length,
    compatibleAudio: sample.filter((s) => s.cls.compatibleAudio).length,
    riskyAudio: sample.filter((s) => s.cls.riskyAudio).length,
    dual: sample.filter((s) => s.cls.hasDual).length,
    hevc: sample.filter((s) => s.cls.hasHevc).length,
    av1: sample.filter((s) => s.cls.hasAv1).length,
    h264: sample.filter((s) => s.cls.hasH264).length,
    flags: sample.filter((s) => s.cls.hasFlags).length,
  };

  console.log(`\n=== ${testCase.label} (${testCase.type}:${testCase.id}) ===`);
  console.log(stats);
  console.log('Top sample:');
  for (const entry of sample.slice(0, 8)) {
    console.log(`- ${entry.title.slice(0, 220)}`);
  }
}

async function main() {
  const arg = process.argv[2];
  const cases = arg
    ? [{ type: arg.includes(':') ? 'series' : 'movie', id: arg, label: arg }]
    : DEFAULT_CASES;

  for (const testCase of cases) {
    try {
      await runCase(testCase);
    } catch (error) {
      console.error(`\n[ERROR] ${testCase.label}:`, error.message);
    }
  }
}

main();
