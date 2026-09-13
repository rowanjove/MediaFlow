import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const screenshotsDir = path.join(rootDir, 'docs', 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const mockPlatforms = [
  { id: 'douyin', name: '抖音', status: 'stable' },
  { id: 'xiaohongshu', name: '小红书', status: 'beta' },
  { id: 'bilibili', name: '哔哩哔哩', status: 'stable' },
  { id: 'kuaishou', name: '快手', status: 'beta' },
  { id: 'weibo', name: '微博', status: 'beta' },
  { id: 'tiktok', name: 'TikTok', status: 'beta' },
  { id: 'instagram', name: 'Instagram', status: 'beta' },
  { id: 'twitter', name: 'X (Twitter)', status: 'beta' },
  { id: 'youtube', name: 'YouTube', status: 'beta' },
  { id: 'qsmusic', name: '汽水音乐', status: 'beta' },
  { id: 'pipixia', name: '皮皮虾', status: 'beta' },
  { id: 'pipigx', name: '皮皮搞笑', status: 'beta' },
  { id: 'xigua', name: '西瓜视频', status: 'beta' },
  { id: 'huoshan', name: '火山', status: 'beta' },
  { id: 'weishi', name: '微视', status: 'beta' },
  { id: 'zuiyou', name: '最右', status: 'beta' },
  { id: 'quanmin', name: '度小视', status: 'beta' },
  { id: 'lishipin', name: '梨视频', status: 'beta' },
  { id: 'huya', name: '虎牙', status: 'beta' },
  { id: 'acfun', name: 'AcFun', status: 'beta' },
  { id: 'meipai', name: '美拍', status: 'beta' },
  { id: 'doupai', name: '逗拍', status: 'beta' },
  { id: 'quanminkge', name: '全民K歌', status: 'beta' },
  { id: 'sixroom', name: '六间房', status: 'beta' },
  { id: 'xinpianchang', name: '新片场', status: 'beta' },
  { id: 'lvzhou', name: '绿洲', status: 'beta' },
  { id: 'haokan', name: '好看视频', status: 'beta' },
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url?.split('?')[0] || '/';

  if (urlPath === '/api/v1/platforms') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ success: true, platforms: mockPlatforms }));
    return;
  }

  let reqPath = urlPath;
  if (reqPath.endsWith('/')) reqPath += 'index.html';

  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 4455;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Preview server running at http://127.0.0.1:${PORT}`);

  function capture(outFile, extraArgs = []) {
    return new Promise((resolve, reject) => {
      const args = [
        '--headless=new',
        '--disable-gpu',
        '--window-size=1280,820',
        '--hide-scrollbars',
        '--virtual-time-budget=2000',
        ...extraArgs,
        `--screenshot=${outFile}`,
        `http://127.0.0.1:${PORT}/`,
      ];
      execFile(edgePath, args, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  try {
    const lightPath = path.join(screenshotsDir, 'preview-light.png');
    const darkPath = path.join(screenshotsDir, 'preview-dark.png');

    console.log('Capturing preview-light.png...');
    await capture(lightPath);
    console.log('Light screenshot captured:', lightPath);

    console.log('Capturing preview-dark.png...');
    await capture(darkPath, ['--blink-settings=forceDarkModeEnabled=true', '--force-dark-mode']);
    console.log('Dark screenshot captured:', darkPath);

    console.log('All screenshots captured successfully!');
  } catch (err) {
    console.error('Screenshot capture failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
