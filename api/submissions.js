// api/submissions.js
import { db } from './lib/firebase-admin.js';

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/submissions
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('submissions').get();
      const submissions = [];
      snapshot.forEach(doc => {
        submissions.push(doc.data());
      });
      return res.status(200).json(submissions);
    } catch (err) {
      console.error('[API Submissions GET] Error:', err);
      return res.status(500).send('提出データの読み込みに失敗しました。');
    }
  }

  // POST /api/submissions (従来の /api/submit からの移行)
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      const { staffId, period, availabilities, submitPattern, submittedAt, lineUserId } = payload;

      if (!staffId || !period || !availabilities || !lineUserId) {
        return res.status(400).send('必須パラメータ（staffId, period, availabilities, lineUserId）が不足しています。');
      }

      // セキュリティ検証 (Firestore Security Rules の模擬):
      // 送信者自身の lineUserId が、操作対象 of staffId から派生する模擬ID（もしくは実際の Firestore users データ）と一致しているかを検証
      // ※簡易的には staffId と lineUserId の関連が正しいか、Firestore で確認する。
      const memberDoc = await db.collection('members').doc(String(staffId)).get();
      if (memberDoc.exists) {
        const memberData = memberDoc.data();
        if (memberData.lineUserId && memberData.lineUserId !== lineUserId) {
          return res.status(403).send('権限エラー: 他人のスケジュール希望を書き換えることはできません。');
        }
      }

      // 締め切りバリデーション
      const deadlineDoc = await db.collection('config').doc('deadline').get();
      if (deadlineDoc.exists) {
        const deadlineData = deadlineDoc.data();
        if (deadlineData.deadlineDate) {
          const deadline = new Date(deadlineData.deadlineDate);
          const now = new Date();
          if (now > deadline) {
            return res.status(403).send('提出締め切り日時を過ぎているため、スケジュール希望は提出できません。');
          }
        }
      }

      const docId = `${staffId}_${period}`;
      const newSubmission = {
        staffId: Number(staffId),
        period,
        availabilities,
        submitPattern: submitPattern || 'A',
        lineUserId,
        submittedAt: submittedAt || new Date().toISOString()
      };

      await db.collection('submissions').doc(docId).set(newSubmission, { merge: true });

      // 【自動競合排除】もし提出されたスケジュールの中で「出勤不可 (false)」があり、
      // 既にその日に店長のアサインが存在している場合、そのアサインを自動削除・更新します。
      let shiftsUpdated = false;
      try {
        const path = await import('path');
        const fs = await import('fs');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const rootDir = path.resolve(__dirname, '../');

        const periodAssignedShiftsPath = path.join(rootDir, `assigned_shifts_${period}.json`);
        const defaultAssignedShiftsPath = path.join(rootDir, 'assigned_shifts.json');
        
        // 存在するアサインファイルをチェック
        const pathsToSync = [];
        if (fs.existsSync(periodAssignedShiftsPath)) pathsToSync.push(periodAssignedShiftsPath);
        if (period === '2026-06' && fs.existsSync(defaultAssignedShiftsPath)) pathsToSync.push(defaultAssignedShiftsPath);

        const filterPattern = submitPattern || 'A';

        for (const filePath of pathsToSync) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const existingShifts = JSON.parse(raw);
          if (Array.isArray(existingShifts)) {
            // 競合するシフトを除去
            const filteredShifts = existingShifts.filter(s => {
              if (s.member_id === Number(staffId)) {
                // パターンA: 明示的に false (休み希望) の場合に削除
                // パターンB: 明示的に true (出勤可能) でない場合に削除
                const isUnavailable = filterPattern === 'B'
                  ? availabilities[s.date] !== true
                  : availabilities[s.date] === false;

                if (isUnavailable) {
                  console.info(`[API Submissions] Auto-removing conflicting assignment for member ${staffId} on ${s.date} (Pattern: ${filterPattern})`);
                  shiftsUpdated = true;
                  return false;
                }
              }
              return true;
            });

            if (shiftsUpdated) {
              fs.writeFileSync(filePath, JSON.stringify(filteredShifts, null, 2), 'utf8');
              
              // public フォルダ側も同期
              const publicPath = path.join(rootDir, 'public', path.basename(filePath));
              if (fs.existsSync(path.dirname(publicPath))) {
                fs.writeFileSync(publicPath, JSON.stringify(filteredShifts, null, 2), 'utf8');
              }
            }
          }
        }
      } catch (err) {
        console.warn('[API Submissions] Warning: Failed to auto-sync conflicting shifts:', err);
      }

      return res.status(200).json({
        message: '提出が正常に受け付けられました。',
        submission: newSubmission,
        shiftsUpdated
      });
    } catch (err) {
      console.error('[API Submissions POST] Error:', err);
      return res.status(500).send('リクエスト処理中にエラーが発生しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
