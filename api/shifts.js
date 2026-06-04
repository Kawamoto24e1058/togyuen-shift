// api/shifts.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rootDir = path.resolve(__dirname, '../');
  const period = req.query.period || req.body.period || '2026-06';

  // GET: 指定期間のシフトデータをロード
  if (req.method === 'GET') {
    try {
      const targetPath = path.join(rootDir, `assigned_shifts_${period}.json`);
      console.info(`[API Shifts GET] Loading shifts for period ${period} from ${targetPath}...`);

      if (fs.existsSync(targetPath)) {
        const raw = fs.readFileSync(targetPath, 'utf8');
        return res.status(200).json(JSON.parse(raw));
      }

      // 存在しない場合、フォールバックとして月単位のJSONファイル（assigned_shifts_${basePeriod}.json or assigned_shifts.json）から該当期間のみ抽出
      if (period.endsWith('-A') || period.endsWith('-B')) {
        const basePeriod = period.substring(0, 7); // e.g. "2026-06"
        const basePaths = [
          path.join(rootDir, `assigned_shifts_${basePeriod}.json`),
          path.join(rootDir, 'assigned_shifts.json')
        ];
        for (const basePath of basePaths) {
          if (fs.existsSync(basePath)) {
            console.info(`[API Shifts GET] Falling back to monthly file: ${basePath}`);
            const raw = fs.readFileSync(basePath, 'utf8');
            const allShifts = JSON.parse(raw);
            const half = period.substring(8); // 'A' or 'B'
            const filtered = allShifts.filter(shift => {
              if (!shift.date || !shift.date.startsWith(basePeriod)) return false;
              const day = Number(shift.date.split('-')[2]);
              if (half === 'A') {
                return day <= 15;
              } else {
                return day >= 16;
              }
            });
            return res.status(200).json(filtered);
          }
        }
      }

      // 存在しない場合、デフォルトファイル or 空配列を返す
      const defaultPath = path.join(rootDir, 'assigned_shifts.json');
      if (period === '2026-06' && fs.existsSync(defaultPath)) {
        console.info(`[API Shifts GET] Falling back to default assigned_shifts.json`);
        const raw = fs.readFileSync(defaultPath, 'utf8');
        return res.status(200).json(JSON.parse(raw));
      }

      console.info(`[API Shifts GET] No shifts found for ${period}. Returning empty list.`);
      return res.status(200).json([]);
    } catch (err) {
      console.error('[API Shifts GET] Error:', err);
      return res.status(500).send(`シフトデータの取得に失敗しました: ${err.message}`);
    }
  }

  // POST: 指定期間のシフトデータを保存
  if (req.method === 'POST') {
    try {
      const { shifts } = req.body || {};
      if (!shifts || !Array.isArray(shifts)) {
        return res.status(400).send('無効なシフトデータです。');
      }

      console.info(`[API Shifts POST] Saving ${shifts.length} shifts for period ${period}...`);

      const targetPath = path.join(rootDir, `assigned_shifts_${period}.json`);
      const targetPublicPath = path.join(rootDir, 'public', `assigned_shifts_${period}.json`);

      // 1. 期間別の JSON ファイルに保存
      fs.writeFileSync(targetPath, JSON.stringify(shifts, null, 2), 'utf8');
      
      // public フォルダにも保存（フォールバック用・静的配信対応）
      os_mkdir_p(path.join(rootDir, 'public'));
      fs.writeFileSync(targetPublicPath, JSON.stringify(shifts, null, 2), 'utf8');

      // 2. 互換性のため、2026-06 の場合はデフォルトの assigned_shifts.json にも保存
      if (period === '2026-06') {
        const defaultPath = path.join(rootDir, 'assigned_shifts.json');
        const defaultPublicPath = path.join(rootDir, 'public', 'assigned_shifts.json');
        fs.writeFileSync(defaultPath, JSON.stringify(shifts, null, 2), 'utf8');
        fs.writeFileSync(defaultPublicPath, JSON.stringify(shifts, null, 2), 'utf8');
      }

      return res.status(200).json({
        success: true,
        message: `${period} のシフト調整データを正常に保存しました。`,
        count: shifts.length
      });
    } catch (err) {
      console.error('[API Shifts POST] Error:', err);
      return res.status(500).send(`シフトデータの保存に失敗しました: ${err.message}`);
    }
  }

  return res.status(405).send('Method Not Allowed');
}

// ディレクトリ作成用の簡易ユーティリティ
function os_mkdir_p(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
