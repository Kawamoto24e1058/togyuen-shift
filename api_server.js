// api_server.js
// Vercel CLIのバグを完全に回避し、ローカルでAPI(api/*.js)をポート3001で起動する極小エミュレーター
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

// .envファイルを簡易パースしてprocess.envへ登録 (ゼロ依存)
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // クォーテーションのトリミング
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  });
  console.log('✅ .env 環境変数を正常に読み込みました。');
}

const PORT = 3001;

// リクエストボディの非同期取得ユーティリティ
async function getRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve(body);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.info(`[API Server] ${req.method} ${pathname}`);

  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    let apiRoute = pathname.replace('/api/', '');
    
    // Vercel Hobby-plan limit mitigation: dispatch consolidated routes
    if (apiRoute.startsWith('shifts/')) {
      req.query = { ...parsedUrl.query, subpath: apiRoute.replace('shifts/', '') };
      apiRoute = 'shifts';
    } else if (apiRoute.startsWith('auth/')) {
      req.query = { ...parsedUrl.query, subpath: apiRoute.replace('auth/', '') };
      apiRoute = 'auth';
    } else if (apiRoute === 'members/update') {
      req.query = { ...parsedUrl.query, action: 'update' };
      apiRoute = 'members';
    } else if (apiRoute === 'members/archive') {
      req.query = { ...parsedUrl.query, action: 'archive' };
      apiRoute = 'members';
    } else if (apiRoute === 'members/update-admin') {
      req.query = { ...parsedUrl.query, action: 'update-admin' };
      apiRoute = 'members';
    }

    let modulePath = path.resolve(`./api/${apiRoute}.js`);
    
    if (!fs.existsSync(modulePath)) {
      modulePath = path.resolve(`./api/${apiRoute}/index.js`);
    }

    if (fs.existsSync(modulePath)) {
      try {
        // ES Module として動的にインポート (キャッシュ破棄のためタイムスタンプを付与)
        const apiModule = await import(url.pathToFileURL(modulePath).href + `?t=${Date.now()}`);
        const handler = apiModule.default;

        // Vercel の req.body/req.query/res.status/res.json などの仕様をエミュレート
        req.query = parsedUrl.query;
        req.body = await getRequestBody(req);

        // Vercel レスポンスヘルパーの注入
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
        };
        res.send = (data) => {
          if (typeof data === 'object') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          } else {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(data);
          }
        };

        // APIハンドラの呼び出し
        await handler(req, res);
      } catch (err) {
        console.error(`❌ [API Server Error] in ${apiRoute}:`, err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`API実行エラー: ${err.message}`);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`APIエンドポイントが見つかりません: ${pathname}`);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.info(`🚀 API Emulator Server is running on http://localhost:${PORT}`);
});
