import { getStreamForTitle } from '../lib/stream-service.js';
import process from 'process';

async function runTests() {
  try {
      console.log('--- TEST 1: Breaking Bad S1 E1 ---');
      const bb = await getStreamForTitle({
        imdbId: 'tt0903747',
        title: 'Breaking Bad',
        year: 2008,
        type: 'tv',
        season: 1,
        episode: 1
      });
      console.log('Result:', bb);

      console.log('\n--- TEST 2: Interstellar ---');
      const inception = await getStreamForTitle({
        imdbId: 'tt0816692',
        title: 'Interstellar',
        year: 2014,
        type: 'movie'
      });
      console.log('Result:', inception);
      
  } catch (err) {
      console.error('Test Failed:', err);
  }
}

runTests();
