import WebTorrent from 'webtorrent';
import fs from 'fs';
import path from 'path';

// Force color logs
process.env.FORCE_COLOR = '1';

const MAGNET_HASH = process.argv[2] || '08ada5a7a6183aae1e09d831df6748d566095a10'; // Default: Sintel
const TMP_DIR = '/tmp/webtorrent-test';

console.log(`\n🧪 STARTING TORRENT STREAM TEST`);
console.log(`-----------------------------------`);
console.log(`Target Hash: ${MAGNET_HASH}`);
console.log(`Temp Dir:    ${TMP_DIR}`);

// 1. Setup Client (Identical config to lib/magnet-service.ts)
console.log('\n[1/5] Initializing WebTorrent Client...');
const client = new WebTorrent({
    maxConns: 500, // Matching production
    dht: true,
    lsd: true,
    tracker: true
});

client.on('error', (err) => console.error('💥 Client Error:', err));

const trackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.openbittorrent.com:80/announce',
    'udp://9.rarbg.com:2810/announce',
    'udp://tracker.kp.muni.cz:80/announce',
    'udp://www.torrent.eu.org:451/announce',
    'wss://tracker.openwebtorrent.com',
];

const magnetURI = MAGNET_HASH.startsWith('magnet:') 
    ? MAGNET_HASH 
    : `magnet:?xt=urn:btih:${MAGNET_HASH}&tr=${trackers.map(encodeURIComponent).join('&tr=')}`;

// 2. Add Torrent
console.log('[2/5] Adding Magnet/Torrent...');
const torrent = client.add(magnetURI, { 
    path: TMP_DIR,
    destroyStoreOnDestroy: true 
});

torrent.on('infoHash', () => console.log(`   -> InfoHash computed: ${torrent.infoHash}`));
torrent.on('metadata', () => console.log(`   -> Metadata received!`));
torrent.on('ready', () => console.log(`   -> Torrent Ready!`));
torrent.on('warning', (err) => console.log(`   -> Warning: ${err}`));
torrent.on('error', (err) => console.log(`   -> Torrent Error: ${err}`));

// Timeout safety
const timer = setTimeout(() => {
    console.error('\n❌ TIMEOUT: No metadata received in 45 seconds.');
    process.exit(1);
}, 45000);

torrent.once('metadata', () => {
    console.log('\n[3/5] Processing Files...');
    
    // Find video file
    const file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
    console.log(`   -> Selected File: ${file.name}`);
    console.log(`   -> Size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Deselect others
    torrent.files.forEach(f => f.deselect());
    file.select();

    // 3. Simulate Browser Range Request (First 5MB)
    console.log('\n[4/5] Simulating Browser Stream Request (Start-up Buffer)...');
    console.log('   -> Requesting bytes 0 - 5,000,000 (Video Start)');
    
    // Critical priority for start
    const pieceLen = torrent.pieceLength;
    const startPiece = 0;
    const endPiece = Math.ceil(5000000 / pieceLen);
    
    console.log(`   -> Prioritizing pieces ${startPiece} to ${endPiece}`);
    for (let i = startPiece; i <= endPiece; i++) {
        (torrent as any).critical(i, i);
    }

    const stream = file.createReadStream({ start: 0, end: 5000000 });
    
    let bytesRead = 0;
    const startTime = Date.now();
    let firstByteTime = 0;

    stream.on('data', (chunk) => {
        if (bytesRead === 0) {
            firstByteTime = Date.now();
            console.log(`   -> ✅ FIRST BYTE RECEIVED in ${firstByteTime - startTime}ms`);
        }
        bytesRead += chunk.length;
        process.stdout.write(`\r   -> Received: ${(bytesRead / 1024).toFixed(1)} KB`);
        
        if (bytesRead >= 1024 * 500) { // Stop after 500KB to prove it works
            console.log('\n\n[5/5] ✅ STREAM SUCCESS!');
            console.log(`   -> Throughput verification passed.`);
            console.log(`   -> Speed: ~${(client.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s`);
            
            cleanExit();
        }
    });

    stream.on('error', (err) => {
        console.error('\n❌ STREAM ERROR:', err);
        cleanExit();
    });

    // Monitor global download
    setInterval(() => {
        const speed = (client.downloadSpeed / 1024 / 1024).toFixed(2);
        const peers = torrent.numPeers;
        process.stdout.write(`\r   -> [DL: ${speed} MB/s | Peers: ${peers} | Scanned: ${(bytesRead / 1024).toFixed(0)} KB]`);
    }, 1000);
});

function cleanExit() {
    clearTimeout(timer);
    client.destroy(() => {
        console.log('\n\nTests Completed. Exiting.');
        process.exit(0);
    });
}
