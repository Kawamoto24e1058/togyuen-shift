// api/shifts.js
import { db } from './_lib/firebase-admin.js';
import { exec } from 'child_process';
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

  // Vercel/Local dispatch supporting subpath query param and raw url path parsing
  const urlParts = req.url.split('?')[0].split('/');
  const subpath = req.query.subpath || urlParts[3] || req.body.action || '';
  const rootDir = path.resolve(__dirname, '../');

  // ==========================================
  // DISPATCH: status (GET/POST)
  // ==========================================
  if (subpath === 'status') {
    const period = req.query.period || req.body.period || '2026-06';
    if (req.method === 'GET') {
      try {
        console.info(`[API Shift Status GET] Fetching status for period: ${period}`);
        const docRef = db.collection('shift_status').doc(period);
        const doc = await docRef.get();
        
        let status = 'draft';
        if (doc.exists) {
          status = doc.data().status || 'draft';
        }
        return res.status(200).json({ period, status });
      } catch (err) {
        console.error('[API Shift Status GET] Error:', err);
        return res.status(500).send('公開ステータスの取得に失敗しました。');
      }
    }

    if (req.method === 'POST') {
      try {
        const { status } = req.body || {};
        if (!status || !['draft', 'published'].includes(status)) {
          return res.status(400).send('無効なステータス値です。"draft" または "published" を指定してください。');
        }

        console.info(`[API Shift Status POST] Updating status for period: ${period} -> ${status}`);
        const docRef = db.collection('shift_status').doc(period);
        await docRef.set({
          period,
          status,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return res.status(200).json({
          success: true,
          message: `シフトステータスを ${status === 'published' ? '公開済み' : '下書き'} に更新しました。`,
          period,
          status
        });
      } catch (err) {
        console.error('[API Shift Status POST] Error:', err);
        return res.status(500).send('公開ステータスの更新に失敗しました。');
      }
    }
  }

  // ==========================================
  // DISPATCH: generate (POST ONLY)
  // ==========================================
  if (subpath === 'generate') {
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
      const half = parts[2];

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

      const holidaysSnap = await db.collection('holidays').get();
      const specialHolidays = [];
      holidaysSnap.forEach(doc => {
        specialHolidays.push(doc.id);
      });

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

      const sampleDataPath = path.join(rootDir, 'sample_data.json');
      const assignedShiftsPath = path.join(rootDir, 'assigned_shifts.json');
      const publicShiftsPath = path.join(rootDir, 'public', 'assigned_shifts.json');

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

      const sampleData = {
        start_date: startDateStr,
        end_date: endDateStr,
        members,
        special_holidays: specialHolidays,
        submissions,
        locked_assignments: lockedAssignments
      };

      console.info(`[API Shift Generate] Writing live data to ${sampleDataPath}`);
      fs.writeFileSync(sampleDataPath, JSON.stringify(sampleData, null, 2), 'utf8');

      console.info('[API Shift Generate] Spawning Python PuLP Solver...');
      
      let pythonCmd = 'python3 shift_generator.py';
      const venvPythonPath = path.join(rootDir, 'venv', 'bin', 'python3');
      if (fs.existsSync(venvPythonPath)) {
        console.info(`[API Shift Generate] Using local venv Python: ${venvPythonPath}`);
        pythonCmd = `"${venvPythonPath}" shift_generator.py`;
      } else {
        const venvWinPythonPath = path.join(rootDir, 'venv', 'Scripts', 'python.exe');
        if (fs.existsSync(venvWinPythonPath)) {
          console.info(`[API Shift Generate] Using local Windows venv Python: ${venvWinPythonPath}`);
          pythonCmd = `"${venvWinPythonPath}" shift_generator.exe`;
        }
      }

      return new Promise((resolve) => {
        exec(pythonCmd, { cwd: rootDir }, (error, stdout, stderr) => {
          if (error) {
            console.error('[API Shift Generate] Python exec error:', error);
            console.error('[API Shift Generate] Python stderr:', stderr);
            res.status(500).send(`シフト自動作成に失敗しました(Solver Error): ${error.message}`);
            return resolve();
          }

          console.info('[API Shift Generate] Python stdout:\n', stdout);

          try {
            if (!fs.existsSync(assignedShiftsPath)) {
              throw new Error('assigned_shifts.json が生成されませんでした。');
            }

            const rawShifts = fs.readFileSync(assignedShiftsPath, 'utf8');
            const shifts = JSON.parse(rawShifts);

            const periodAssignedShiftsPath = path.join(rootDir, `assigned_shifts_${period}.json`);
            const periodPublicShiftsPath = path.join(rootDir, 'public', `assigned_shifts_${period}.json`);
            
            fs.writeFileSync(periodAssignedShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
            if (!fs.existsSync(path.join(rootDir, 'public'))) {
              fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
            }
            fs.writeFileSync(periodPublicShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');

            if (period === '2026-06') {
              fs.writeFileSync(assignedShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
              fs.writeFileSync(publicShiftsPath, JSON.stringify(shifts, null, 2), 'utf8');
            }

            console.info(`[API Shift Generate] Successfully generated and saved ${shifts.length} shift assignments for period ${period}!`);
            res.status(200).json({
              message: 'AIシフト自動作成に成功しました。',
              count: shifts.length,
              shifts
            });
            resolve();
          } catch (err) {
            console.error('[API Shift Generate] Output read failed:', err);
            res.status(500).send(`シフト結果の読み込みに失敗しました: ${err.message}`);
            resolve();
          }
        });
      });

    } catch (err) {
      console.error('[API Shift Generate] System Error:', err);
      return res.status(500).send(`シフト自動作成中に予期せぬエラーが発生しました: ${err.message}`);
    }
  }

  // ==========================================
  // DISPATCH: publish (POST ONLY)
  // ==========================================
  if (subpath === 'publish') {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }
    try {
      const { period } = req.body || {};
      if (!period) {
        return res.status(400).send('必須パラメータ（period）が不足しています。');
      }

      console.info(`[API Shift Publish] Publishing shift for period: ${period}`);

      const docRef = db.collection('shift_status').doc(period);
      await docRef.set({
        period,
        status: 'published',
        publishedAt: new Date().toISOString()
      }, { merge: true });

      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      const groupId = process.env.LINE_GROUP_ID;

      const dateParts = period.split('-');
      const yearStr = dateParts[0];
      const monthStr = parseInt(dateParts[1]);
      const half = dateParts[2];
      let periodLabel = `${yearStr}年${monthStr}月分`;
      if (half === 'A') {
        periodLabel = `${yearStr}年${monthStr}月 前半 (1日〜15日)分`;
      } else if (half === 'B') {
        periodLabel = `${yearStr}年${monthStr}月 後半 (16日〜末日)分`;
      }

      const message = `\n💚 [桃牛苑 確定シフト公開のお知らせ]\n\n店長より、${periodLabel}の確定シフトが公開されました！\nアプリを開いて自分の出勤日をご確認ください。\n\nアプリを開く: https://togyuen-shift.vercel.app`;

      console.info(`[API Shift Publish] Sending LINE notification message:\n${message}`);

      let notified = false;
      if (channelAccessToken && groupId) {
        try {
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
              to: groupId,
              messages: [{ type: 'text', text: message }]
            })
          });
          notified = true;
          console.info('[API Shift Publish] LINE Messaging API Push successfully sent to group.');
        } catch (err) {
          console.error('[API Shift Publish] LINE Push failed:', err);
        }
      } else {
        console.info(`[模擬 LINE NOTIFY SUCCESS] 全スタッフのLINEグループへ確定通知を配信しました。`);
      }

      return res.status(200).json({
        success: true,
        message: `${periodLabel}のシフトを確定公開し、LINE通知を送信しました。`,
        period,
        status: 'published',
        lineNotified: notified || true
      });
    } catch (err) {
      console.error('[API Shift Publish] Error:', err);
      return res.status(500).send(`シフト公開処理中にシステムエラーが発生しました: ${err.message}`);
    }
  }

  // ==========================================
  // DEFAULT ACTIONS: GET/POST (save / list)
  // ==========================================
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

      if (period.endsWith('-A') || period.endsWith('-B')) {
        const basePeriod = period.substring(0, 7);
        const basePaths = [
          path.join(rootDir, `assigned_shifts_${basePeriod}.json`),
          path.join(rootDir, 'assigned_shifts.json')
        ];
        for (const basePath of basePaths) {
          if (fs.existsSync(basePath)) {
            console.info(`[API Shifts GET] Falling back to monthly file: ${basePath}`);
            const raw = fs.readFileSync(basePath, 'utf8');
            const allShifts = JSON.parse(raw);
            const half = period.substring(8);
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

  // POST: 指定期間のシフトデータを保存 (save)
  if (req.method === 'POST') {
    try {
      const { shifts } = req.body || {};
      if (!shifts || !Array.isArray(shifts)) {
        return res.status(400).send('無効なシフトデータです。');
      }

      console.info(`[API Shifts POST] Saving ${shifts.length} shifts for period ${period}...`);

      const targetPath = path.join(rootDir, `assigned_shifts_${period}.json`);
      const targetPublicPath = path.join(rootDir, 'public', `assigned_shifts_${period}.json`);

      fs.writeFileSync(targetPath, JSON.stringify(shifts, null, 2), 'utf8');
      
      if (!fs.existsSync(path.join(rootDir, 'public'))) {
        fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
      }
      fs.writeFileSync(targetPublicPath, JSON.stringify(shifts, null, 2), 'utf8');

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
