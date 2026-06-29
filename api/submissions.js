// api/submissions.js
import { db } from './_lib/firebase-admin.js';

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
      console.warn('[API Submissions GET] Warning (falling back to empty list):', err);
      return res.status(200).json([]);
    }
  }

  // POST /api/submissions (従来の /api/submit からの移行)
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      const { staffId, period, availabilities, submitPattern, submittedAt, lineUserId } = payload;

      if (!staffId || !period || !availabilities) {
        return res.status(400).send('必須パラメータ（staffId, period, availabilities）が不足しています。');
      }

      // staffId の存在確認のみ行う (LINE連携撤去のため lineUserId 検証は不要)
      const memberDoc = await db.collection('members').doc(String(staffId)).get();
      if (!memberDoc.exists) {
        return res.status(404).send('指定されたスタッフが見つかりません。');
      }

      // 動的締め切り計算 (当月後半Bなら10日、翌月前半Aなら25日) - JSTタイムゾーンセーフ
      const getDeadlineForPeriod = (periodStr) => {
        const parts = periodStr.split("-");
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const half = parts[2];
        let dateStr;
        if (half === "B") {
          dateStr = `${year}-${String(month).padStart(2, '0')}-10T23:59:59+09:00`;
        } else {
          const prevDate = new Date(year, month - 2, 1);
          const prevYear = prevDate.getFullYear();
          const prevMonth = prevDate.getMonth() + 1;
          dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-25T23:59:59+09:00`;
        }
        return new Date(dateStr);
      };

      const deadline = getDeadlineForPeriod(period);
      const now = new Date();
      const isPastDeadline = now > deadline;

      if (isPastDeadline) {
        return res.status(403).send('提出締め切り日時を過ぎているため、スケジュール希望は提出・変更できません。');
      }

      const docId = `${staffId}_${period}`;
      const newSubmission = {
        staffId: Number(staffId),
        period,
        availabilities,
        submitPattern: submitPattern || 'A',
        lineUserId,
        isSubmitted: payload.isSubmitted === true,
        submittedAt: submittedAt || new Date().toISOString()
      };

      await db.collection('submissions').doc(docId).set(newSubmission, { merge: true });

      // 【自動生成連動】全員分が集まった場合、または既に公開済みの期間での修正の場合、自動的にシフト表を再生成して公開更新する
      if (payload.isSubmitted === true) {
        try {
          const membersSnap = await db.collection('members').get();
          const activeMembers = [];
          membersSnap.forEach(doc => {
            const m = doc.data();
            if (m.isActive !== false) {
              activeMembers.push(Number(doc.id));
            }
          });

          const subsSnap = await db.collection('submissions')
            .where('period', '==', period)
            .get();
          
          const submittedIds = new Set();
          subsSnap.forEach(doc => {
            const s = doc.data();
            if (s.isSubmitted === true && s.staffId) {
              submittedIds.add(Number(s.staffId));
            }
          });

          const allSubmitted = activeMembers.every(id => submittedIds.has(id));

          const statusDoc = await db.collection('shift_status').doc(period).get();
          const isPublished = statusDoc.exists && statusDoc.data().status === 'published';

          if (isPublished || (allSubmitted && activeMembers.length > 0)) {
            console.info(`[API Submissions] Triggering auto-generate & publish for ${period}...`);
            const shiftsModule = await import('./shifts.js');
            const shiftsHandler = shiftsModule.default;

            const mockRes = {
              status: (code) => mockRes,
              send: (msg) => { console.info(`[Auto-Generate Output] send: ${msg}`); },
              json: (data) => { console.info(`[Auto-Generate Output] json: ${JSON.stringify(data)}`); }
            };

            // 自動生成を実行
            await shiftsHandler({
              method: 'POST',
              url: '/api/shifts/generate',
              query: {},
              body: { period }
            }, mockRes);

            // 公開処理を実行
            await shiftsHandler({
              method: 'POST',
              url: '/api/shifts/publish',
              query: {},
              body: { period }
            }, mockRes);
            
            console.info(`[API Submissions] Auto-generation and publication completed!`);
          }
        } catch (e) {
          console.error('[API Submissions] Auto-generation trigger failed:', e);
        }
      }

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
