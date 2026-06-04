// api/shifts/save.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { shifts, period = '2026-06' } = req.body || {};
    if (!shifts || !Array.isArray(shifts)) {
      return res.status(400).send('無効なシフトデータです。');
    }

    const rootDir = path.resolve(__dirname, '../../');
    const targetPath = path.join(rootDir, `assigned_shifts_${period}.json`);
    const targetPublicPath = path.join(rootDir, 'public', `assigned_shifts_${period}.json`);

    console.info(`[API Shifts Save] Saving ${shifts.length} shift assignments for period ${period}...`);

    // 1. 期間別の JSON ファイルに保存
    fs.writeFileSync(targetPath, JSON.stringify(shifts, null, 2), 'utf8');
    
    // public フォルダにも保存（フォールバック用・静的配信対応）
    if (!fs.existsSync(path.join(rootDir, 'public'))) {
      fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
    }
    fs.writeFileSync(targetPublicPath, JSON.stringify(shifts, null, 2), 'utf8');

    // 2. 互換性のため、2026-06 の場合はデフォルトの assigned_shifts.json にも保存
    if (period === '2026-06') {
      const defaultPath = path.join(rootDir, 'assigned_shifts.json');
      const defaultPublicPath = path.join(rootDir, 'public', 'assigned_shifts.json');
      fs.writeFileSync(defaultPath, JSON.stringify(shifts, null, 2), 'utf8');
      fs.writeFileSync(defaultPublicPath, JSON.stringify(shifts, null, 2), 'utf8');
    }

    console.info(`[API Shifts Save] Successfully saved shifts manually!`);

    return res.status(200).json({
      success: true,
      message: '手動シフト調整データを正常に保存しました。',
      count: shifts.length
    });
  } catch (err) {
    console.error('[API Shifts Save] Error:', err);
    return res.status(500).send(`シフトの保存に失敗しました: ${err.message}`);
  }
}
