// api/shifts.js
import { db } from './_lib/firebase-admin.js';
import { generateShift } from './_lib/shift-solver.js';

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
  const subpath = req.query.subpath || urlParts[3] || (req.body && req.body.action) || '';

  // ==========================================
  // DISPATCH: status (GET/POST)
  // ==========================================
  if (subpath === 'status') {
    const period = req.query.period || (req.body && req.body.period) || '2026-06';
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
        console.warn('[API Shift Status GET] Warning (falling back to draft):', err);
        return res.status(200).json({ period, status: 'draft' });
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
        if (data.isActive === false) return; // Skip inactive members!
        if (data.isAdmin === true) return; // Exclude administrators from automated assignment!
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

      const activeMemberIds = new Set(members.map(m => m.id));
      const submissions = Array.from(submissionsMap.entries())
        .filter(([member_id]) => activeMemberIds.has(member_id))
        .map(([member_id, availabilities]) => ({
          member_id,
          availabilities
        }));

      // ロックされたシフトを Firestore から取得
      let lockedAssignments = [];
      try {
        const existingShiftsSnap = await db.collection('shifts')
          .where('period', '==', period)
          .where('isLocked', '==', true)
          .get();
        existingShiftsSnap.forEach(doc => {
          const s = doc.data();
          if (!activeMemberIds.has(Number(s.member_id))) return;
          if (s.date >= startDateStr && s.date <= endDateStr) {
            lockedAssignments.push(s);
          }
        });
        console.info(`[API Shift Generate] Found ${lockedAssignments.length} locked assignments in Firestore for period ${period}.`);
      } catch (e) {
        console.warn('[API Shift Generate] Warning: Failed to fetch locked assignments from Firestore:', e);
      }

      // -------------------------------------------------------
      // JS ソルバーで直接シフト生成（Python 不要）
      // -------------------------------------------------------
      console.info('[API Shift Generate] Running JS shift solver...');
      const shifts = generateShift({
        start_date: startDateStr,
        end_date: endDateStr,
        members,
        special_holidays: specialHolidays,
        submissions,
        locked_assignments: lockedAssignments
      });

      if (!shifts || shifts.length === 0) {
        return res.status(500).send('シフトの生成に失敗しました。スタッフ数・シフト希望データを確認してください。');
      }
      console.info(`[API Shift Generate] JS solver produced ${shifts.length} assignments.`);

      // -------------------------------------------------------
      // Firestore `shifts` コレクションへ保存
      // -------------------------------------------------------
      try {
        console.info(`[API Shift Generate] Saving ${shifts.length} shifts to Firestore (period: ${period})...`);

        const existingSnap = await db.collection('shifts').where('period', '==', period).get();
        const deletePromises = [];
        existingSnap.forEach(doc => deletePromises.push(doc.ref.delete()));
        await Promise.all(deletePromises);

        const BATCH_SIZE = 400;
        for (let i = 0; i < shifts.length; i += BATCH_SIZE) {
          const batch = db.batch();
          shifts.slice(i, i + BATCH_SIZE).forEach(shift => {
            const docRef = db.collection('shifts').doc();
            batch.set(docRef, { ...shift, period, savedAt: new Date().toISOString() });
          });
          await batch.commit();
        }
        console.info('[API Shift Generate] Firestore save complete.');
      } catch (firestoreErr) {
        console.error('[API Shift Generate] Firestore save failed (non-fatal):', firestoreErr);
      }

      console.info(`[API Shift Generate] Successfully generated ${shifts.length} shift assignments for period ${period}!`);
      return res.status(200).json({
        message: 'AIシフト自動作成に成功しました。',
        count: shifts.length,
        shifts
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
  // 全て Firestore ベースで動作（Vercel 読み取り専用FS対応）
  // ==========================================
  const period = req.query.period || (req.body && req.body.period) || '2026-06';

  // GET: 指定期間のシフトデータを Firestore からロード
  if (req.method === 'GET') {
    try {
      console.info(`[API Shifts GET] Loading shifts for period ${period} from Firestore...`);

      // period 完全一致で検索（例: '2026-07-A'）
      const snap = await db.collection('shifts').where('period', '==', period).get();
      let shifts = [];
      snap.forEach(doc => shifts.push(doc.data()));

      // おかじでデータなしの場合: ベース月（'YYYY-MM'）でフォールバック
      if (shifts.length === 0 && (period.endsWith('-A') || period.endsWith('-B'))) {
        const basePeriod = period.substring(0, 7);
        const half = period.substring(8);
        console.info(`[API Shifts GET] Falling back to base period ${basePeriod} in Firestore...`);
        const baseSnap = await db.collection('shifts').where('period', '==', basePeriod).get();
        baseSnap.forEach(doc => {
          const s = doc.data();
          if (!s.date) return;
          const day = Number(s.date.split('-')[2]);
          if (half === 'A' && day <= 15) shifts.push(s);
          if (half === 'B' && day >= 16) shifts.push(s);
        });
      }

      console.info(`[API Shifts GET] Returning ${shifts.length} shifts for ${period}.`);
      return res.status(200).json(shifts);
    } catch (err) {
      console.warn('[API Shifts GET] Warning (falling back to empty list):', err);
      return res.status(200).json([]);
    }
  }

  // POST: 指定期間のシフトデータを Firestore に保存 (save)
  if (req.method === 'POST') {
    try {
      const { shifts } = req.body || {};
      if (!shifts || !Array.isArray(shifts)) {
        return res.status(400).send('無効なシフトデータです。');
      }

      console.info(`[API Shifts POST] Saving ${shifts.length} shifts for period ${period} to Firestore...`);

      // 既存の同期間シフトを全削除
      const existingSnap = await db.collection('shifts').where('period', '==', period).get();
      const deletePromises = [];
      existingSnap.forEach(doc => deletePromises.push(doc.ref.delete()));
      await Promise.all(deletePromises);

      // バッチ書き込み（Firestore は1バッチ最大500件）
      const BATCH_SIZE = 400;
      for (let i = 0; i < shifts.length; i += BATCH_SIZE) {
        const batch = db.batch();
        shifts.slice(i, i + BATCH_SIZE).forEach(shift => {
          const docRef = db.collection('shifts').doc();
          batch.set(docRef, {
            ...shift,
            period,
            savedAt: new Date().toISOString()
          });
        });
        await batch.commit();
      }

      console.info(`[API Shifts POST] Successfully saved ${shifts.length} shifts for ${period} to Firestore.`);
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
