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
      const { staffId, period, availabilities, submittedAt, lineUserId } = payload;

      if (!staffId || !period || !availabilities || !lineUserId) {
        return res.status(400).send('必須パラメータ（staffId, period, availabilities, lineUserId）が不足しています。');
      }

      // セキュリティ検証 (Firestore Security Rules の模擬):
      // 送信者自身の lineUserId が、操作対象の staffId から派生する模擬ID（もしくは実際の Firestore users データ）と一致しているかを検証
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
        lineUserId,
        submittedAt: submittedAt || new Date().toISOString()
      };

      await db.collection('submissions').doc(docId).set(newSubmission, { merge: true });

      return res.status(200).json({
        message: '提出が正常に受け付けられました。',
        submission: newSubmission
      });
    } catch (err) {
      console.error('[API Submissions POST] Error:', err);
      return res.status(500).send('リクエスト処理中にエラーが発生しました。');
    }
  }

  return res.status(404).send('Method Not Allowed');
}
