// ============================================================
// functions/index.js
// Firebase Cloud Functions — スケジュール自動リマインダー
//
// 毎月 15日・25日 の 朝9:00 と 夜20:00 (JST) に自動起動し、
// シフト未提出のスタッフへ「LINE グループ通知」と「FCM プッシュ通知」を
// 同時に一斉配信します。
// ============================================================

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import admin from "firebase-admin";
import https from "https";

// Firebase Admin SDK の初期化
admin.initializeApp();
const db   = admin.firestore();
const fcm  = admin.messaging();

// -------------------------------------------------------
// 対象期間を自動計算するヘルパー
// 実行日が 1〜20 日 → 当月、21日以降 → 翌月 を対象とする
// -------------------------------------------------------
function getCurrentPeriod() {
  const now = new Date();
  const day = now.getDate();
  const year  = now.getFullYear();
  const month = day > 20
    ? (now.getMonth() === 11 ? 1 : now.getMonth() + 2)   // 翌月（年またぎ考慮）
    : now.getMonth() + 1;                                  // 当月
  const periodYear = (day > 20 && now.getMonth() === 11) ? year + 1 : year;
  return `${periodYear}-${String(month).padStart(2, "0")}`;
}

// -------------------------------------------------------
// メインのスケジュール関数
// -------------------------------------------------------
export const scheduledReminder = onSchedule({
  schedule:  "0 9,20 15,25 * *",
  timeZone:  "Asia/Tokyo",
  memory:    "256MiB",
}, async () => {
  logger.info("桃牛苑 シフト提出締め切り自動リマインダー起動");

  const now           = new Date();
  const todayDate     = now.getDate();
  const currentPeriod = getCurrentPeriod();

  try {
    // ── 1. 全スタッフを Firestore から取得 ──────────────────
    const usersSnap = await db.collection("members").get();
    if (usersSnap.empty) {
      logger.info("登録スタッフなし。終了します。");
      return;
    }

    const allMembers = [];
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.isActive !== false) {
        allMembers.push({ id: doc.id, ...data });
      }
    });

    // ── 2. 当月の提出済み lineUserId を収集 ────────────────
    const subsSnap = await db.collection("submissions")
      .where("period", "==", currentPeriod)
      .get();

    const submittedIds = new Set();
    subsSnap.forEach(doc => {
      const d = doc.data();
      if (d.lineUserId) submittedIds.add(d.lineUserId);
    });

    // ── 3. 未提出スタッフを抽出 ─────────────────────────────
    const unsubmitted = allMembers.filter(m => !submittedIds.has(m.lineUserId));

    if (unsubmitted.length === 0) {
      logger.info("全員提出済み。通知不要。");
      return;
    }

    const namesList = unsubmitted.map(m => `${m.name} さん`).join("、");
    logger.info(`未提出者: ${namesList}`);

    // ── 4. LINE グループへのメッセージ配信 ──────────────────
    const lineMsg = [
      `【桃牛苑 シフト提出リマインド】`,
      `本日${todayDate}日はシフトの締め切り日です。`,
      `まだ提出されていない方はアプリから入力をお願いします。`,
      ``,
      `対象者：${namesList}`,
    ].join("\n");

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineGroupId        = process.env.LINE_GROUP_ID;

    if (channelAccessToken && lineGroupId) {
      await sendLineGroupMessage(lineGroupId, lineMsg, channelAccessToken);
      logger.info("LINE グループ通知を配信しました。");
    } else {
      logger.warn("LINE 環境変数が未設定のため、LINE 通知をスキップしました。");
    }

    // ── 5. FCM Web プッシュ通知を一斉送信 ───────────────────
    await sendFcmPushToUnsubmitted(unsubmitted, todayDate);

  } catch (err) {
    logger.error("リマインダー処理中にエラーが発生しました:", err);
  }
});

// -------------------------------------------------------
// FCM マルチキャスト送信
// 未提出スタッフ全員の fcmTokens を収集して一括送信する
// -------------------------------------------------------
async function sendFcmPushToUnsubmitted(unsubmittedMembers, todayDate) {
  // 各スタッフの users/{lineUserId} から fcmTokens を収集
  const allTokens = [];

  await Promise.all(
    unsubmittedMembers.map(async (m) => {
      if (!m.lineUserId) return;
      try {
        const userDoc = await db.collection("users").doc(m.lineUserId).get();
        if (!userDoc.exists) return;
        const tokens = userDoc.data()?.fcmTokens || [];
        allTokens.push(...tokens);
      } catch (e) {
        logger.warn(`FCM トークン取得失敗 (${m.name}):`, e.message);
      }
    })
  );

  if (allTokens.length === 0) {
    logger.info("FCM トークンが登録されていないためプッシュ通知をスキップします。");
    return;
  }

  // 重複トークンを除去
  const uniqueTokens = [...new Set(allTokens)];
  logger.info(`FCM 送信対象トークン数: ${uniqueTokens.length}`);

  // FCM は 1 リクエスト最大 500 トークン制限があるためチャンク送信
  const CHUNK = 500;
  for (let i = 0; i < uniqueTokens.length; i += CHUNK) {
    const chunk = uniqueTokens.slice(i, i + CHUNK);

    const message = {
      notification: {
        title: "桃牛苑 シフト提出の締め切り",
        body:  `本日${todayDate}日がシフトの締め切り日です。アプリから入力をお願いします。`,
      },
      webpush: {
        notification: {
          icon:  "/icon-192.png",
          badge: "/icon-72.png",
          tag:   "shift-reminder",
          requireInteraction: false,
        },
        fcmOptions: {
          link: "/",
        },
      },
      tokens: chunk,
    };

    const result = await fcm.sendEachForMulticast(message);

    logger.info(
      `FCM バッチ送信完了 — 成功: ${result.successCount} / 失敗: ${result.failureCount}`
    );

    // 無効なトークン（登録解除済み）を Firestore から削除
    const invalidTokens = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(chunk[idx]);
        }
        logger.warn(`FCM 送信失敗 [${idx}]: ${resp.error?.message}`);
      }
    });

    // 無効トークンをクリーンアップ
    if (invalidTokens.length > 0) {
      await cleanupInvalidTokens(invalidTokens);
    }
  }

  logger.info("FCM プッシュ通知の一斉送信が完了しました。");
}

// -------------------------------------------------------
// 無効な FCM トークンを Firestore から削除する
// -------------------------------------------------------
async function cleanupInvalidTokens(invalidTokens) {
  logger.info(`無効トークンを削除: ${invalidTokens.length} 件`);

  const usersSnap = await db.collection("users").get();
  const batch = db.batch();

  usersSnap.forEach(doc => {
    const tokens = doc.data()?.fcmTokens || [];
    const cleaned = tokens.filter(t => !invalidTokens.includes(t));
    if (cleaned.length !== tokens.length) {
      batch.update(doc.ref, { fcmTokens: cleaned });
    }
  });

  await batch.commit();
  logger.info("無効トークンのクリーンアップが完了しました。");
}

// -------------------------------------------------------
// LINE Messaging API — グループへのプッシュメッセージ送信
// -------------------------------------------------------
function sendLineGroupMessage(groupId, text, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      to:       groupId,
      messages: [{ type: "text", text }],
    });

    const options = {
      hostname: "api.line.me",
      path:     "/v2/bot/message/push",
      method:   "POST",
      headers: {
        "Content-Type":    "application/json",
        "Authorization":   `Bearer ${accessToken}`,
        "Content-Length":  Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`LINE API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
