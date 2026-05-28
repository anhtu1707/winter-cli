const https = require('https');
const url = 'https://speed.hetzner.de/100MB.bin'; // 100 MiB test file

function measureDownload() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let downloaded = 0;
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (chunk) => {
        downloaded += chunk.length;
      });
      res.on('end', () => {
        const durationSec = (Date.now() - start) / 1000;
        const mbps = (downloaded * 8) / (durationSec * 1e6); // megabits per second
        resolve({downloaded, durationSec, mbps});
      });
    });
    req.on('error', reject);
  });
}

measureDownload()
  .then(({downloaded, durationSec, mbps}) => {
    console.log('Downloaded', (downloaded / (1024 * 1024)).toFixed(2), 'MiB');
    console.log('Duration', durationSec.toFixed(2), 's');
    console.log('Speed', mbps.toFixed(2), 'Mbps');
  })
  .catch((err) => {
    console.error('Error:', err.message);
  });
