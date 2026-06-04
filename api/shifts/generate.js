// api/shifts/generate.js
import { db } from '../lib/firebase-admin.js';
import { exec } from 'child_process';
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
    const { period = '2026-06-A' } = req.body || {};
    console.info(`[API Shift Generate] Starting generation for period: ${period}...`);
    console.info('[API Shift Generate] Fetching live data from Firestore...');

    const parts = period.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const half = parts[2]; // 'A' or 'B'

    const daysInMonth = new Date(year, month, 0).getDate();
    let startDateStr, endDateStr;

    if (half === 'A') {
      startDateStr = `${parts[0]}-${parts[1]}-01`;
      endDateStr = `${parts[0]}-${parts[1]}-15`;
    } else if (half === 'B') {
      startDateStr = `${parts[0]}-${parts[1]}-16`;
      endDateStr = `${parts[0]}-${parts[1]}-${String(daysInMonth).padStart(2, '0')}`;
    } else {
      startDateStr = `${parts[0]}-${parts[1]}-01`;
      endDateStr = `${parts[0]}-${parts[1]}-${String(daysInMonth).padStart(2, '0')}`;
    }

    // 1. Firestore 'members' から全有効スタッフを取得
    const membersSnap = await db.collection('members').get();
    const members = [];
    membersSnap.forEach(doc => {
      const data = doc.data();
      let targetDays = data.targetDays !== undefined ? Number(data.targetDays) : 5;
      if (targetDays > 7) {
        targetDays = Math.floor(targetDays / 2);
      }
      members.push({
        id: Number(doc.id),
        name: data.name,
        roles: data.roles || [data.role || 'hall'],
        status: data.status || 'regular',
        targetDays: targetDays
      });
    });

    if (members.length === 0) {
      return res.status(400).send('登録スタッフがいないため、シフトを作成できません。');
    }

    // 2. Firestore 'holidays' から全臨時休業日を取得
    const holidaysSnap = await db.collection('holidays').get();
    const specialHolidays = [];
    holidaysSnap.forEach(doc => {
      specialHolidays.push(doc.id);
    });

    // 3. Firestore 'submissions' から指定期間の提出データをすべて取得 (月単位 fallback/merge 含む)
    const submissionsMap = new Map();
    const subsSnap = await db.collection('submissions').where('period', '==', period).get();
    subsSnap.forEach(doc => {
      const data = doc.data();
      submissionsMap.set(Number(data.staffId), data.availabilities || {});
    });

    if (half === 'A' || half === 'B') {
      const baseMonth = `${parts[0]}-${parts[1]}`;
      const baseSubsSnap = await db.collection('submissions').where('period', '==', baseMonth).get();
      baseSubsSnap.forEach(doc => {
        const data = doc.data();
        const staffId = Number(data.staffId);
        if (!submissionsMap.has(staffId) && data.availabilities) {
          const filteredAvail = {};
          Object.keys(data.availabilities).forEach(dateStr => {
            const day = Number(dateStr.split('-')[2]);
            if (half === 'A' && day <= 15) {
              filteredAvail[dateStr] = data.availabilities[dateStr];
            } else if (half === 'B' && day >= 16) {
              filteredAvail[dateStr] = data.availabilities[dateStr];
            }
          });
          submissionsMap.set(staffId, filteredAvail);
        }
      });
    }

    const submissions = Array.from(submissionsMap.entries()).map(([member_id, availabilities]) => ({
      member_id,
      availabilities
    }));

    const rootDir = path.resolve(__dirname, '../../'); // プロジェクトのルートディレクトリ
    const sampleDataPath = path.join(rootDir, 'sample_data.json');
    const assignedShiftsPath = path.join(rootDir, 'assigned_shifts.json');
    const publicShiftsPath = path.join(rootDir, 'public', 'assigned_shifts.json');

    // 3.5 既存の assigned_shifts_${period}.json (または assigned_shifts.json) から
    // 今回の期間に含まれるロックされたアサイン（isLocked: true）を抽出します
    let lockedAssignments = [];
    const periodAssignedShiftsPath = path.join(rootDir, `assigned_shifts_${period}.json`);
    const pathToCheck = fs.existsSync(periodAssignedShiftsPath) ? periodAssignedShiftsPath : assignedShiftsPath;
    if (fs.existsSync(pathToCheck)) {
      try {
        const rawShifts = fs.readFileSync(pathToCheck, 'utf8');
        const existingShifts = JSON.parse(rawShifts);
        if (Array.isArray(existingShifts)) {
          lockedAssignments = existingShifts.filter(s => {
            if (s.isLocked !== true) return false;
            return s.date >= startDateStr && s.date <= endDateStr;
          });
        }
        console.info(`[API Shift Generate] Found ${lockedAssignments.length} locked assignments in ${path.basename(pathToCheck)} for period ${period} to preserve.`);
      } catch (e) {
        console.warn('[API Shift Generate] Warning: Failed to parse existing assigned_shifts:', e);
      }
    }

    // 4. sample_data.json の構造を構築
    const sampleData = {
      start_date: startDateStr,
      end_date: endDateStr,
      members,
      special_holidays: specialHolidays,
      submissions,
      locked_assignments: lockedAssignments // ロック固定されたシフト
    };

    // 5. sample_data.json を書き出し
    console.info(`[API Shift Generate] Writing live data to ${sampleDataPath}`);
    fs.writeFileSync(sampleDataPath, JSON.stringify(sampleData, null, 2), 'utf8');

    // 6. Pythonの数理最適化ソルバー (shift_generator.py) を実行
    console.info('[API Shift Generate] Spawning Python PuLP Solver...');
    
    // ローカル開発環境で venv (仮想環境) があれば優先して使用し、なければグローバルな python3 を使用します
    let pythonCmd = 'python3 shift_generator.py';
    const venvPythonPath = path.join(rootDir, 'venv', 'bin', 'python3');
    if (fs.existsSync(venvPythonPath)) {
      console.info(`[API Shift Generate] Using local venv Python: ${venvPythonPath}`);
      pythonCmd = `"${venvPythonPath}" shift_generator.py`;
    } else {
      const venvWinPythonPath = path.join(rootDir, 'venv', 'Scripts', 'python.exe');
      if (fs.existsSync(venvWinPythonPath)) {
        console.info(`[API Shift Generate] Using local Windows venv Python: ${venvWinPythonPath}`);
        pythonCmd = `"${venvWinPythonPath}" shift_generator.py`;
      }
    }

    exec(pythonCmd, { cwd: rootDir }, (error, stdout, stderr) => {
      if (error) {
        console.error('[API Shift Generate] Python exec error:', error);
        console.error('[API Shift Generate] Python stderr:', stderr);
        return res.status(500).send(`シフト自動作成に失敗しました(Solver Error): ${error.message}`);
      }

      console.info('[API Shift Generate] Python stdout:\n', stdout);

      // 7. 生成された assigned_shifts.json を読み込んで返却
      try {
        if (!fs.existsSync(assignedShiftsPath)) {
          throw new Error('assigned_shifts.json が生成されませんでした。');
        }

        const rawShifts = fs.readFileSync(assignedShiftsPath, 'utf8');
        const shifts = JSON.parse(rawShifts);

        // 期間別の JSON ファイルに保存
        const periodAssignedShiftsPath = path.join(rootDir, `assigned_shifts_${period}.json`);
        const periodPublicShiftsPath = path.join(rootDir, 'public', `assigned_shifts_${period}.json`);
        
        fs.writeFileSync(periodAssignedShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
        if (!fs.existsSync(path.join(rootDir, 'public'))) {
          fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
        }
        fs.writeFileSync(periodPublicShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');

        // 互換性維持のため、2026-06 の場合はデフォルトの assigned_shifts.json にも保存
        if (period === '2026-06') {
          fs.writeFileSync(assignedShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
          fs.writeFileSync(publicShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
        }

        console.info(`[API Shift Generate] Successfully generated and saved ${shifts.length} shift assignments for period ${period}!`);
        return res.status(200).json({
          message: 'AIシフト自動作成に成功しました。',
          count: shifts.length,
          shifts
        });
      } catch (err) {
        console.error('[API Shift Generate] Output read failed:', err);
        return res.status(500).send(`シフト結果の読み込みに失敗しました: ${err.message}`);
      }
    });

  } catch (err) {
    console.error('[API Shift Generate] System Error:', err);
    return res.status(500).send(`シフト自動作成中に予期せぬエラーが発生しました: ${err.message}`);
  }
}
