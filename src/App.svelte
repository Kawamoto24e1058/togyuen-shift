<script>
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    Calendar,
    Users,
    ShieldAlert,
    CheckCircle2,
    MessageSquare,
    Bell,
    Plus,
    Trash2,
    RotateCcw,
    X,
    Utensils,
    Lock,
    Smartphone,
    Clock,
    Sparkles,
    Moon,
    Flame,
  } from "lucide-svelte";

  // Firebase FCMヘルパー
  import {
    requestNotificationPermissionAndSaveToken,
    onForegroundMessage,
  } from "./firebase.js";

  /**
   * @typedef {Object} Member
   * @property {number} id
   * @property {string} name
   * @property {string} role
   * @property {string[]} roles
   * @property {string} status
   * @property {string} [roleName]
   * @property {string} [statusName]
   * @property {string} [color]
   * @property {string} [emoji]
   * @property {number} [targetDays]
   * @property {string} [lineUserId]
   * @property {string} [avatar]
   * @property {boolean} [isAdmin]
   */

  /**
   * @typedef {Object} Shift
   * @property {string} date
   * @property {number} member_id
   * @property {string} member_name
   * @property {string} role
   * @property {string} start_time
   * @property {boolean} [isLocked]
   */

  // 初期メンバーマスタ (実環境移行のため空配列)
  const INITIAL_MEMBERS = [];

  // 初期シフト (実環境移行のため空配列)
  const DEFAULT_SHIFTS = [];

  // 月度ステート (デフォルト: 2026年6月 前半)
  let currentPeriod = "2026-06-A";

  // 日付リストを動的に生成するヘルパー関数 (前半: 1-15日, 後半: 16-末日)
  /**
   * @param {string} periodStr
   */
  function generateDates(periodStr) {
    const parts = periodStr.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const half = parts[2]; // 'A' or 'B'

    const daysInMonth = new Date(year, month, 0).getDate();
    let startDay = 1;
    let endDay = daysInMonth;

    if (half === "A") {
      endDay = 15;
    } else if (half === "B") {
      startDay = 16;
    }

    const wNameList = ["日", "月", "火", "水", "木", "金", "土"];
    const dates = [];

    for (let dayNum = startDay; dayNum <= endDay; dayNum++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dateObj = new Date(year, month - 1, dayNum);
      const wName = wNameList[dateObj.getDay()];
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const isRegularClosed = dateObj.getDay() === 3; // 毎週水曜定休

      dates.push({
        dateStr,
        day: `${month}/${String(dayNum).padStart(2, "0")}`,
        wName,
        isWeekend,
        isRegularClosed,
        dayNum,
      });
    }
    return dates;
  }

  // カレンダーグリッド用のセルを動的生成するヘルパー関数 (曜日を揃えて期間外を曇りガラスに)
  /**
   * @param {string} periodStr
   */
  function generateGridCells(periodStr) {
    const parts = periodStr.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const half = parts[2]; // 'A' or 'B'

    const daysInMonth = new Date(year, month, 0).getDate();
    let startDay = 1;
    let endDay = daysInMonth;

    if (half === "A") {
      endDay = 15;
    } else if (half === "B") {
      startDay = 16;
    }

    const wNameList = ["日", "月", "火", "水", "木", "金", "土"];
    const cells = [];

    // 1. 開始日の曜日を揃えるために、期間開始前の余白セルを追加 (曇りガラス)
    const firstDateObj = new Date(year, month - 1, startDay);
    const firstDayOfWeek = firstDateObj.getDay(); // 0 = 日曜日, 6 = 土曜日

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const prevDateObj = new Date(year, month - 1, startDay - 1 - i);
      const prevDayNum = prevDateObj.getDate();
      const prevMonth = prevDateObj.getMonth() + 1;
      const prevYear = prevDateObj.getFullYear();
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(prevDayNum).padStart(2, "0")}`;

      cells.push({
        dateStr,
        day: `${prevMonth}/${String(prevDayNum).padStart(2, "0")}`,
        wName: wNameList[prevDateObj.getDay()],
        isWeekend: prevDateObj.getDay() === 0 || prevDateObj.getDay() === 6,
        isRegularClosed: prevDateObj.getDay() === 3,
        isOtherMonth: true, // 他の期間（非アクティブセル）
        dayNum: prevDayNum,
      });
    }

    // 2. 当該期間の日付セルを追加
    for (let dayNum = startDay; dayNum <= endDay; dayNum++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dateObj = new Date(year, month - 1, dayNum);
      cells.push({
        dateStr,
        day: `${month}/${String(dayNum).padStart(2, "0")}`,
        wName: wNameList[dateObj.getDay()],
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        isRegularClosed: dateObj.getDay() === 3,
        isOtherMonth: false,
        dayNum,
      });
    }

    // 3. グリッドを揃えるために、期間終了後の余白セルを追加 (曇りガラス、7の倍数)
    const totalCellsNeeded = Math.ceil(cells.length / 7) * 7;
    const nextDaysToAdd = totalCellsNeeded - cells.length;
    for (let i = 1; i <= nextDaysToAdd; i++) {
      const nextDateObj = new Date(year, month - 1, endDay + i);
      const nextDayNum = nextDateObj.getDate();
      const nextMonth = nextDateObj.getMonth() + 1;
      const nextYear = nextDateObj.getFullYear();
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDayNum).padStart(2, "0")}`;

      cells.push({
        dateStr,
        day: `${nextMonth}/${String(nextDayNum).padStart(2, "0")}`,
        wName: wNameList[nextDateObj.getDay()],
        isWeekend: nextDateObj.getDay() === 0 || nextDateObj.getDay() === 6,
        isRegularClosed: nextDateObj.getDay() === 3,
        isOtherMonth: true, // 他の期間（非アクティブセル）
        dayNum: nextDayNum,
      });
    }

    return cells;
  }

  // スタッフ名の識別用の一文字（頭文字など）を取得するヘルパー関数
  // 同時期のメンバーリスト内で頭文字の衝突を回避します
  /**
   * @param {string} name
   * @param {Member[]} [membersList]
   */
  function getMemberInitial(name, membersList = []) {
    if (!name) return "";
    const firstChar = name.charAt(0);
    const collisions = membersList.filter(
      (m) => m.name && m.name.charAt(0) === firstChar && m.name !== name,
    );
    if (collisions.length === 0) {
      return firstChar;
    }
    if (name.length > 1) {
      const lastChar = name.charAt(name.length - 1);
      const lastCharCollisions = membersList.filter(
        (m) =>
          m.name &&
          m.name.charAt(m.name.length - 1) === lastChar &&
          m.name !== name,
      );
      if (lastCharCollisions.length === 0) {
        return lastChar;
      }
      return name.charAt(1);
    }
    return firstChar;
  }

  // リアクティブ変数として定義
  $: DATES = generateDates(currentPeriod);
  $: GRID_CELLS = generateGridCells(currentPeriod);

  // 日曜始まりのヘッダー定義
  const CALENDAR_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];

  // アプリケーションステート
  let activeTab = "calendar";
  /** @type {Shift[]} */
  let shifts = DEFAULT_SHIFTS;
  /** @type {Member[]} */
  let members = INITIAL_MEMBERS;
  /** @type {string[]} */
  let specialHolidays = [];
  let shiftStatus = "draft"; // 'draft' (下書き) | 'published' (公開済み)
  let isGenerating = false;
  /** @type {string | null} */
  let toastMessage = null;
  let activeQuickMenuDate = null; // iOS風臨時休業選択用クイックポップアップ状態

  // 提出保存・締め切り用の新規ステート
  let isSubmitting = false;
  let deadlineDate = "2026-05-30T23:59:59";
  let deadlineInput = "2026-05-30T23:59";
  let isLocked = false;
  let isAutoSaving = false;
  let hasPendingChanges = false;
  /** @type {any} */
  let saveTimeout = null;

  $: isLocked = deadlineDate ? new Date() > new Date(deadlineDate) : false;

  /** @type {any[]} */
  let allSubmissions = [];

  async function fetchSubmissions() {
    try {
      const res = await fetch("/api/submissions");
      if (res.ok) {
        allSubmissions = await res.json();
      }
    } catch (e) {
      console.error("[App] Failed to load submissions:", e);
    }
  }

  $: isAllShiftsValid = DATES.every(d => validationResults[d.dateStr]?.isValid !== false);
  $: submittedStaffIds = new Set(
    allSubmissions
      .filter((sub) => sub.period === currentPeriod)
      .map((sub) => Number(sub.staffId))
  );
  $: unsubmittedMembers = members.filter(
    (m) => !submittedStaffIds.has(Number(m.id))
  );
  $: unsubmittedCount = unsubmittedMembers.length;

  // PWA帰還（引き戻し）ネイティブアプリ化ステート＆ロジック
  let showPwaRedirectScreen = false;
  let pwaLaunchUrl = "/";
  let isStandalone = typeof window !== "undefined" && (
    window.navigator.standalone || 
    window.matchMedia("(display-mode: standalone)").matches
  );
  let pwaSessionId = null;
  /** @type {any} */
  let pwaPollInterval = null;
  let isWaitingForPwaLogin = false;

  function cancelPwaLogin() {
    if (pwaPollInterval) {
      clearInterval(pwaPollInterval);
      pwaPollInterval = null;
    }
    localStorage.removeItem("pwaSessionId");
    pwaSessionId = null;
    isWaitingForPwaLogin = false;
    isAuthenticating = false;
  }

  /**
   * @param {string} sessionId
   */
  function startPwaPoll(sessionId) {
    if (!sessionId) return;
    isWaitingForPwaLogin = true;
    if (pwaPollInterval) clearInterval(pwaPollInterval);
    
    pwaPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/pwa-status?pwaSessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            clearInterval(pwaPollInterval);
            pwaPollInterval = null;
            localStorage.removeItem("pwaSessionId");
            pwaSessionId = null;
            isWaitingForPwaLogin = false;
            isAuthenticating = false;
            
            const userData = data.user;
            if (userData.registered === false) {
              unlinkedLineUserId = userData.lineUserId;
              unlinkedDisplayName = userData.displayName;
              regName = userData.displayName || "";
              showRegistrationForm = true;
              triggerToast("✨ 初回サインイン: プロフィール作成画面へ移行します。");
            } else {
              currentUser = userData;
              localStorage.setItem("currentUser", JSON.stringify(userData));
              triggerToast(`💚 LINEログイン成功: ${userData.name}さんとして認証されました。`);
              selectedStaffId = userData.id;
              await loadStaffSubmissions(userData.id);
              requestFcmToken(userData.lineUserId).catch(console.error);
            }
          }
        }
      } catch (e) {
        console.error("[PWA Poll] Error:", e);
      }
    }, 2000);
  }

  // LINEログイン・ユーザーセッション用ステート
  /** @type {Member | null} */
  let currentUser = null;

  // 本物の LINE ログイン用ステート
  let isAuthenticating = false;
  /** @type {string | null} */
  let authErrorMessage = null;
  /** @type {string | null} */
  let unlinkedLineUserId = null;
  let unlinkedDisplayName = null;

  // FCM プッシュ通知用ステート
  let fcmPermissionStatus = "idle"; // 'idle' | 'requesting' | 'granted' | 'denied'
  /** @type {{ title: string, body: string } | null} */
  let foregroundNotification = null; // フォアグラウンドメッセージ表示用

  /**
   * FCMトークン取得とFirestore保存。ログイン完了直後またはonMount時に呼び出す。
   * @param {string} [lineUserId]
   */
  async function requestFcmToken(lineUserId) {
    if (typeof window === "undefined" || !lineUserId) return;
    // まだ未承諾の場合はリクエストパーミッションダイアログを出す
    if (Notification?.permission === "default") {
      fcmPermissionStatus = "requesting";
    }
    const token = await requestNotificationPermissionAndSaveToken(lineUserId);
    if (token) {
      fcmPermissionStatus = "granted";
    } else {
      fcmPermissionStatus =
        Notification?.permission === "denied" ? "denied" : "idle";
    }
  }

  // 本物の LINE ログイン開始処理
  async function handleLineLogin() {
    isAuthenticating = true;
    authErrorMessage = null;
    try {
      let url = "/api/auth/line-url";
      if (isStandalone) {
        pwaSessionId = "pwa_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("pwaSessionId", pwaSessionId);
        url += `?pwaSessionId=${pwaSessionId}`;
        startPwaPoll(pwaSessionId);
      }
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("認可URLの生成に失敗しました。");
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      isAuthenticating = false;
      triggerToast(`⚠️ LINEログインエラー: ${err.message}`);
    }
  }



  function handleSignOut() {
    currentUser = null;
    localStorage.removeItem("currentUser");
    unlinkedLineUserId = null;
    unlinkedDisplayName = null;
    authErrorMessage = null;
    showRegistrationForm = false;
    regName = "";
    regRoles = [];
    regStatus = "regular";
    staffAvailabilities = {};
    activeTab = "calendar"; // シフト表へリダイレクト
    triggerToast("👋 サインアウトしました。セッションを終了しました。");
  }

  // 初回プロフィール作成フォーム用のリアクティブ変数
  let showRegistrationForm = false;
  let regName = "";
  /** @type {string[]} */
  let regRoles = []; // ["kitchen"], ["hall"], ["kitchen", "hall"]
  let regStatus = "regular"; // "regular" | "trainee"
  let isRegistering = false;

  // 新規スタッフプロフィール登録処理
  async function handleRegisterProfile() {
    if (!regName.trim()) {
      triggerToast("⚠️ お名前を入力してください。");
      return;
    }
    if (regRoles.length === 0) {
      triggerToast("⚠️ 担当タグ（役割）を1つ以上選択してください。");
      return;
    }

    isRegistering = true;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          roles: regRoles,
          status: regStatus,
          lineUserId: unlinkedLineUserId,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.registered) {
        const registeredUser = {
          ...data.user,
          avatar: regRoles.includes("kitchen") ? "👨‍🍳" : "👩‍💼", // アイコン自動アサイン
          isAdmin: !!data.user.isAdmin,
        };
        currentUser = registeredUser;

        // ログインキャッシュを作成
        localStorage.setItem("currentUser", JSON.stringify(registeredUser));
        triggerToast(
          `💚 登録が完了しました！${registeredUser.name}さん、歓迎します。`,
        );

        // 登録用ステートを綺麗に初期化
        showRegistrationForm = false;
        regName = "";
        regRoles = [];
        regStatus = "regular";

        selectedStaffId = registeredUser.id;
        await loadStaffSubmissions(registeredUser.id);

        // FCM通知許可を促す
        requestFcmToken(registeredUser.lineUserId).catch(console.error);
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 登録エラー: ${err.message}`);
    } finally {
      isRegistering = false;
    }
  }

  // ネオンハイライトギミック用 (画面A) - ログインユーザー自身の出勤枠をハイライトします
  $: highlightMemberId = currentUser ? currentUser.id : null;

  // 自分のシフトだけ表示フィルター
  let showMyShiftsOnly = false;

  // モーダル・ダイアログ制御
  /** @type {string | null} */
  let selectedEditDate = null;
  /** @type {string | null} */
  let selectedBulkClosedDay = null;

  // ドラッグ＆ドロップ
  /** @type {{ memberId: number, sourceDate: string, role: string } | null} */
  let draggingItem = null;
  /** @type {string | null} */
  let dragOverDate = null;

  // 従業員希望提出用のステート (画面B)
  let selectedStaffId = 3;
  let submitPattern = "A";
  /** @type {Record<string, boolean>} */
  let staffAvailabilities = {};
  /** @type {Record<number, string>} */
  let staffDefaultPatterns = {
    1: "A",
    2: "A",
    3: "A",
    4: "A",
    5: "A",
    6: "B",
    7: "B",
  };

  // 特定スタッフの提出データをDBからロードして復元する関数
  /**
   * @param {number} staffId
   */
  async function loadStaffSubmissions(staffId) {
    try {
      submitPattern = staffDefaultPatterns[staffId] || "A";
      const res = await fetch("/api/submissions");
      if (res.ok) {
        /** @type {any[]} */
        const data = await res.json();
        const mySub = data.find(
          (sub) =>
            sub.staffId === Number(staffId) && sub.period === currentPeriod,
        );
        if (mySub && mySub.availabilities) {
          staffAvailabilities = mySub.availabilities;
          if (mySub.submitPattern) {
            submitPattern = mySub.submitPattern;
          }
        } else {
          // フォールバック: 2026-06-A や 2026-06-B が存在しない場合、月単位の 2026-06 などのデータから該当期間の日付希望を抽出
          const baseMonth = currentPeriod.substring(0, 7); // e.g. "2026-06"
          const monthSub = data.find(
            (sub) =>
              sub.staffId === Number(staffId) && sub.period === baseMonth,
          );
          if (monthSub && monthSub.availabilities) {
            const half = currentPeriod.substring(8); // "A" or "B"
            /** @type {Record<string, boolean>} */
            const filteredAvail = {};
            Object.keys(monthSub.availabilities).forEach((dateStr) => {
              const day = Number(dateStr.split("-")[2]);
              if (half === "A" && day <= 15) {
                filteredAvail[dateStr] = monthSub.availabilities[dateStr];
              } else if (half === "B" && day >= 16) {
                filteredAvail[dateStr] = monthSub.availabilities[dateStr];
              }
            });
            staffAvailabilities = filteredAvail;
            if (monthSub.submitPattern) {
              submitPattern = monthSub.submitPattern;
            }
          } else {
            staffAvailabilities = {};
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchDeadline() {
    try {
      const res = await fetch("/api/deadline");
      if (res.ok) {
        const data = await res.json();
        deadlineDate = data.deadlineDate;
        const dObj = new Date(deadlineDate);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, "0");
        const d = String(dObj.getDate()).padStart(2, "0");
        const h = String(dObj.getHours()).padStart(2, "0");
        const min = String(dObj.getMinutes()).padStart(2, "0");
        deadlineInput = `${y}-${m}-${d}T${h}:${min}`;
      }
    } catch (e) {
      console.error("Deadline fetch failed:", e);
    }
  }

  async function handleUpdateDeadline() {
    if (!deadlineInput) return;
    try {
      const formattedDate = new Date(deadlineInput).toISOString();
      const res = await fetch("/api/deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlineDate: formattedDate }),
      });
      if (res.ok) {
        deadlineDate = formattedDate;
        triggerToast("✅ 提出締め切り日時を更新しました！");
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      triggerToast(`⚠️ 更新エラー: ${err.message}`);
    }
  }

  onMount(() => {
    /** @type {any} */
    let unsubscribeForeground;

    async function init() {
      // 0. マウント時にFirestoreから臨時休業データ、メンバー一覧、公開ステータスを取得
      await fetchHolidays();
      await fetchMembers();
      await fetchShiftStatus(currentPeriod);
      await fetchSubmissions();

      // 0.5 PWAからのログイン待機セッションを復元
      const savedPwaSessionId = localStorage.getItem("pwaSessionId");
      if (savedPwaSessionId && isStandalone) {
        startPwaPoll(savedPwaSessionId);
      }

      // 1. ローカルストレージから既存のサインインセッションを復元
      const cachedUser = localStorage.getItem("currentUser");
      if (cachedUser) {
        try {
          const parsedUser = JSON.parse(cachedUser);
          if (parsedUser) {
            currentUser = parsedUser;

            // ローカルストレージ内の古いlineUserIdの自動同期クリーニング
            const dbMember = members.find((m) => m.id === parsedUser.id);
            if (
              dbMember &&
              dbMember.lineUserId &&
              parsedUser.lineUserId !== dbMember.lineUserId
            ) {
              console.info(
                `[App] Syncing outdated lineUserId from ${parsedUser.lineUserId} to ${dbMember.lineUserId}`,
              );
              parsedUser.lineUserId = dbMember.lineUserId;
              currentUser = parsedUser;
              localStorage.setItem("currentUser", JSON.stringify(currentUser));
            }

            // バックグラウンドでFCMトークンの自動確認・更新
            requestFcmToken(parsedUser.lineUserId).catch(console.error);
            if (parsedUser.id) {
              selectedStaffId = parsedUser.id;
              loadStaffSubmissions(parsedUser.id).catch(console.error);
            }
          }
        } catch (e) {
          localStorage.removeItem("currentUser");
        }
      }

      // 2. URLパラメータからLINE OAuth認証コード (code) の有無を確認
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      if (code) {
        isAuthenticating = true;
        authErrorMessage = null;
        triggerToast("🔐 LINEログイン認証中...");

        try {
          const res = await fetch("/api/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, state }),
          });

          if (!res.ok) {
            throw new Error(await res.text());
          }

          const data = await res.json();
          
          if (state && state.startsWith("pwa_")) {
            showPwaRedirectScreen = true;
            isAuthenticating = false;
            
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) {
              pwaLaunchUrl = "webapp://" + window.location.host + "/";
            } else {
              pwaLaunchUrl = "/";
            }
            
            triggerToast("🎉 LINE認証完了。PWAアプリへ引き戻します...");
            setTimeout(() => {
              window.location.href = pwaLaunchUrl;
            }, 1000);
            return;
          }

          if (data.registered) {
            const loggedInUser = {
              ...data.user,
              avatar:
                members.find((m) => m.id === Number(data.user.id))?.emoji || "🧑‍🍳",
              isAdmin: !!data.user.isAdmin,
            };
            currentUser = loggedInUser;
            localStorage.setItem("currentUser", JSON.stringify(loggedInUser));
            triggerToast(
              `💚 LINEログイン成功: ${loggedInUser.name}さんとして認証されました。`,
            );

            selectedStaffId = loggedInUser.id;
            await loadStaffSubmissions(loggedInUser.id);

            requestFcmToken(loggedInUser.lineUserId).catch(console.error);
          } else {
            // 未登録 (lineUserId が Firestore の members に未登録)
            unlinkedLineUserId = data.lineUserId;
            unlinkedDisplayName = data.displayName;
            regName = data.displayName || ""; // お名前を初期入力欄に補完
            showRegistrationForm = true; // Apple風初回登録フォームをアクティブにする
            triggerToast("✨ 初回サインイン: プロフィール作成画面へ移行します。");
          }
        } catch (error) {
          const err = /** @type {any} */ (error);
          console.error(err);
          authErrorMessage = `LINE認証に失敗しました: ${err.message}`;
          triggerToast(`⚠️ 認証エラー: ${err.message}`);
        } finally {
          isAuthenticating = false;
          // URLパラメータをクリアしてアドレスバーを綺麗にする (SPA)
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        }
      }

      // 既存の初期化処理
      await loadShifts(currentPeriod);

      fetchDeadline();

      // フォアグラウンドメッセージ受信ハンドラーを登録
      unsubscribeForeground = onForegroundMessage((/** @type {any} */ payload) => {
        const title =
          payload.notification?.title || "桃牛苑 シフト提出の締め切り";
        const body =
          payload.notification?.body ||
          "本日シフトの締め切り日です。アプリから入力をお願いします。";
        foregroundNotification = { title, body };
        setTimeout(() => {
          foregroundNotification = null;
        }, 8000);
      });
    }

    init();

    return () => {
      if (typeof unsubscribeForeground === "function") unsubscribeForeground();
    };
  });

  // リアクティブ制約バリデーション
  $: validationResults = DATES.reduce((acc, d) => {
    const dateStr = d.dateStr;
    const isClosed = d.isRegularClosed || specialHolidays.includes(dateStr);

    if (isClosed) {
      const count = shifts.filter((s) => s.date === dateStr).length;
      acc[dateStr] =
        count > 0
          ? { isValid: false, message: "休業日アサインあり" }
          : { isValid: true };
      return acc;
    }

    const todayShifts = shifts.filter((s) => s.date === dateStr);
    const kitchenCount = todayShifts.filter((s) => s.role === "kitchen").length;
    const hallCount = todayShifts.filter((s) => s.role === "hall").length;

    if (kitchenCount < 1 || hallCount < 1) {
      acc[dateStr] = { isValid: false, message: "キッチン・ホール不足" };
      return acc;
    }

    const traineeStaff = todayShifts.filter((s) => {
      const m = members.find((mem) => mem.id === s.member_id);
      return m && m.status === "trainee";
    });
    const hasTrainee = traineeStaff.length > 0;

    const totalCount = todayShifts.length;
    const requiredTotal = hasTrainee ? 3 : 2;
    if (totalCount < requiredTotal) {
      acc[dateStr] = {
        isValid: false,
        message: hasTrainee
          ? "研修生がいる日は総勢3名以上必須"
          : "通常営業日は総勢2名以上必須",
      };
      return acc;
    }

    const invalidTrainee = traineeStaff.some(() => {
      const dateObj = new Date(dateStr);
      return dateObj.getDay() !== 0 && dateObj.getDay() !== 6;
    });
    if (invalidTrainee) {
      acc[dateStr] = { isValid: false, message: "研修生は土日のみ出勤可能" };
      return acc;
    }

    acc[dateStr] = { isValid: true };
    return acc;
  }, /** @type {Record<string, { isValid: boolean, message?: string }>} */ ({}));

  $: memberAssignedStats = members.map((m) => {
    const count = shifts.filter((s) => s.member_id === m.id).length;
    const targetDays =
      m.targetDays !== undefined
        ? m.targetDays > 7
          ? Math.floor(m.targetDays / 2)
          : m.targetDays
        : 5;
    const target = m.status === "trainee" ? "土日" : targetDays;
    const isOk = m.status === "trainee" ? count > 0 : count === targetDays;
    const isUnder = m.status === "regular" && count < targetDays;
    const isOver = m.status === "regular" && count > targetDays;
    return {
      ...m,
      count,
      target,
      isOk,
      isUnder,
      isOver,
    };
  });

  /**
   * @param {string} msg
   */
  function triggerToast(msg) {
    toastMessage = msg;
    setTimeout(() => {
      toastMessage = null;
    }, 3000);
  }

  /**
   * @param {string | null} dateStr
   * @param {string | number} memberIdRole
   */
  async function handleAddStaff(dateStr, memberIdRole) {
    if (!dateStr) return;
    // memberIdRole can be "memberId:role" or just "memberId"
    const parts = String(memberIdRole).split(":");
    const memberId = Number(parts[0]);
    const assignedRole = parts[1] || null;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    // Choose role: explicit from dropdown, or fallback to primary role
    const role = assignedRole || member.role;

    // Prevent same member assigned to same date in same role
    const already = shifts.some(
      (s) => s.date === dateStr && s.member_id === member.id && s.role === role,
    );
    if (already) {
      triggerToast(
        `⚠️ ${member.name}さん(${role === "kitchen" ? "キッチン" : "ホール"})は配置済みです。`,
      );
      return;
    }

    const start = role === "kitchen" ? "17:00" : "17:30";
    const updatedShifts = [
      ...shifts,
      {
        date: dateStr,
        member_id: member.id,
        member_name: member.name,
        role: role,
        start_time: start,
      },
    ];
    shifts = updatedShifts;
    await saveShiftsManually(updatedShifts);
  }

  /**
   * @param {string | null} dateStr
   * @param {number} memberId
   * @param {string} [role]
   */
  async function handleRemoveStaff(dateStr, memberId, role) {
    if (!dateStr) return;
    let updatedShifts;
    if (role) {
      updatedShifts = shifts.filter(
        (s) =>
          !(s.date === dateStr && s.member_id === memberId && s.role === role),
      );
    } else {
      updatedShifts = shifts.filter(
        (s) => !(s.date === dateStr && s.member_id === memberId),
      );
    }
    shifts = updatedShifts;
    await saveShiftsManually(updatedShifts);
  }

  async function fetchMembers() {
    try {
      const res = await fetch("/api/members");
      if (res.ok) {
        members = await res.json();
      }
    } catch (e) {
      console.error("[App] Failed to load members:", e);
    }
  }

  /**
   * @param {Shift[]} currentShifts
   */
  async function saveShiftsManually(currentShifts) {
    try {
      const res = await fetch("/api/shifts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: currentShifts, period: currentPeriod }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      console.info("[App] Shift saved successfully.");
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("シフトの手動保存に失敗しました:", err);
      triggerToast(`⚠️ シフトの自動保存に失敗しました: ${err.message}`);
    }
  }

  async function loadShifts(targetPeriod = "2026-06") {
    try {
      const res = await fetch(`/api/shifts?period=${targetPeriod}`);
      if (res.ok) {
        shifts = await res.json();
      } else {
        shifts = [];
      }
    } catch (e) {
      console.error("[App] Failed to load shifts:", e);
      shifts = [];
    }
  }

  async function handlePeriodChange() {
    triggerToast(`📅 対象月を ${currentPeriod} に切り替えました。`);
    // 1. 公開ステータスの再取得
    await fetchShiftStatus(currentPeriod);
    // 2. シフトデータのロード
    await loadShifts(currentPeriod);
    // 3. 提出状況の再取得
    await fetchSubmissions();
    // 4. 一般スタッフの場合は自分の提出希望も再ロード
    if (currentUser && currentUser.id) {
      await loadStaffSubmissions(currentUser.id);
    }
  }

  /**
   * @param {number} memberId
   * @param {number | string} days
   */
  async function updateMemberTargetDays(memberId, days) {
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, targetDays: Number(days) }),
      });
      if (res.ok) {
        const data = await res.json();
        // ローカルの members 配列を更新
        members = members.map((m) => {
          if (m.id === memberId) {
            return { ...m, targetDays: Number(days) };
          }
          return m;
        });
        triggerToast(
          `🎯 ${members.find((m) => m.id === memberId)?.name}さんの目標出勤日数を ${days} 日に更新しました。`,
        );
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("目標出勤日数の更新に失敗しました:", err);
      triggerToast(`⚠️ 更新失敗: ${err.message}`);
    }
  }

  async function fetchShiftStatus(targetPeriod = "2026-06") {
    try {
      const res = await fetch(`/api/shifts/status?period=${targetPeriod}`);
      if (res.ok) {
        const data = await res.json();
        shiftStatus = data.status || "draft";
      }
    } catch (e) {
      console.error("[App] Failed to load shift status:", e);
    }
  }

  async function publishShifts(targetPeriod = "2026-06") {
    try {
      const res = await fetch("/api/shifts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: targetPeriod }),
      });
      if (res.ok) {
        const data = await res.json();
        shiftStatus = data.status;
        triggerToast("💚 シフトを確定公開し、LINE通知を送信しました！");
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("シフトの公開に失敗しました:", err);
      triggerToast(`⚠️ シフト公開に失敗しました: ${err.message}`);
    }
  }

  async function revertShiftsToDraft(targetPeriod = "2026-06") {
    try {
      const res = await fetch("/api/shifts/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: targetPeriod, status: "draft" }),
      });
      if (res.ok) {
        const data = await res.json();
        shiftStatus = data.status;
        triggerToast("✏️ シフトを下書き状態に戻しました。");
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("下書きへの変更に失敗しました:", err);
      triggerToast(`⚠️ 変更に失敗しました: ${err.message}`);
    }
  }

  async function fetchHolidays() {
    try {
      const res = await fetch("/api/holidays");
      if (res.ok) {
        specialHolidays = await res.json();
      }
    } catch (e) {
      console.error("[App] Failed to load holidays:", e);
    }
  }

  /**
   * @param {string | null} dateStr
   */
  async function toggleSpecialHoliday(dateStr) {
    if (!dateStr) return;
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      specialHolidays = data.holidays; // APIが返却する最新リストに更新

      if (data.isHoliday) {
        // 臨時休業日に設定された場合、その日の既存アサインを消去
        shifts = shifts.filter((s) => s.date !== dateStr);
        triggerToast(`🔴 ${dateStr} を臨時休業日に設定しました。`);
      } else {
        triggerToast(`🟢 ${dateStr} を通常営業に戻しました。`);
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      triggerToast(`⚠️ 休業設定エラー: ${err.message}`);
    }
  }

  async function handleSendRemind() {
    try {
      const res = await fetch("/api/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: currentPeriod }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      if (data.remindedCount === 0) {
        triggerToast("📢 未提出メンバーはいません（全員提出済みです）。");
      } else {
        triggerToast(
          `📢 未提出の${data.remindedCount}名（${data.remindedNames.join(", ")}）へLINEリマインドを配信しました！`,
        );
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      triggerToast(`⚠️ リマインド配信失敗: ${err.message}`);
    }
  }

  async function handleReGenerate() {
    isGenerating = true;
    triggerToast("⏳ AI自動シフト作成（Python数理最適化）を開始しました...");
    try {
      const res = await fetch("/api/shifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: currentPeriod }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      if (data.shifts && data.shifts.length > 0) {
        shifts = data.shifts;
        // 最適化結果を取得した後に、再度臨時休業リストもリロードして表示整合性を保ちます
        await fetchHolidays();
        triggerToast(
          `✨ AI自動シフト作成が完了しました！ (${data.count}件のアサイン)`,
        );
      } else {
        triggerToast("⚠️ 生成されたシフトデータが空です。");
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      triggerToast(`⚠️ シフト自動作成に失敗しました: ${err.message}`);
      console.error(err);
    } finally {
      isGenerating = false;
    }
  }

  /**
   * @param {string | null} wName
   */
  async function handleBulkClosedSetting(wName) {
    if (!wName) return;
    const targetDateStrs = DATES.filter((d) => d.wName === wName).map(
      (d) => d.dateStr,
    );
    const allHolidays = targetDateStrs.every((dStr) =>
      specialHolidays.includes(dStr),
    );

    if (allHolidays) {
      specialHolidays = specialHolidays.filter(
        (d) => !targetDateStrs.includes(d),
      );
      // Firestoreから一括削除 (非同期)
      for (const dStr of targetDateStrs) {
        try {
          await fetch("/api/holidays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: dStr }), // すでに存在するので削除される
          });
        } catch (e) {}
      }
      triggerToast(`🟢 ${wName}曜日の一括休業を解除しました。`);
    } else {
      const added = targetDateStrs.filter((d) => !specialHolidays.includes(d));
      specialHolidays = Array.from(
        new Set([...specialHolidays, ...targetDateStrs]),
      );
      shifts = shifts.filter((s) => !targetDateStrs.includes(s.date));
      // Firestoreに一括追加 (非同期)
      for (const dStr of added) {
        try {
          await fetch("/api/holidays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: dStr }), // 存在しないので追加される
          });
        } catch (e) {}
      }
      triggerToast(`🔴 ${wName}曜日を一括臨時休業に設定しました。`);
    }
    selectedBulkClosedDay = null;
  }

  // ドラッグ＆ドロップ (店長画面)
  /**
   * @param {DragEvent} e
   * @param {number} memberId
   * @param {string} sourceDate
   * @param {string} role
   */
  function handleDragStart(e, memberId, sourceDate, role) {
    draggingItem = { memberId, sourceDate, role };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
    const target = /** @type {HTMLElement} */ (e.target);
    if (target) target.classList.add("dragging");
  }

  /**
   * @param {DragEvent} e
   */
  function handleDragEnd(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target) target.classList.remove("dragging");
    draggingItem = null;
    dragOverDate = null;
  }

  /**
   * @param {DragEvent} e
   * @param {string} dateStr
   */
  function handleDragOver(e, dateStr) {
    e.preventDefault();
    if (draggingItem && draggingItem.sourceDate !== dateStr) {
      dragOverDate = dateStr;
    }
  }

  /**
   * @param {DragEvent} e
   * @param {string} targetDate
   */
  async function handleDrop(e, targetDate) {
    e.preventDefault();
    dragOverDate = null;
    if (!draggingItem) return;

    const { memberId, sourceDate, role: dragRole } = draggingItem;
    if (sourceDate === targetDate) return;

    const d = DATES.find((date) => date.dateStr === targetDate);
    const isClosed = d?.isRegularClosed || specialHolidays.includes(targetDate);
    if (isClosed) return;

    // Prevent duplicate: same member + same role on same day
    const already = shifts.some(
      (s) =>
        s.date === targetDate &&
        s.member_id === memberId &&
        s.role === dragRole,
    );
    if (already) return;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    // Remove the source shift entry (match by date, member, and role)
    const filtered = shifts.filter(
      (s) =>
        !(
          s.date === sourceDate &&
          s.member_id === memberId &&
          s.role === dragRole
        ),
    );
    const role = dragRole || member.role;
    const start = role === "kitchen" ? "17:00" : "17:30";
    const updatedShifts = [
      ...filtered,
      {
        date: targetDate,
        member_id: member.id,
        member_name: member.name,
        role: role,
        start_time: start,
      },
    ];
    shifts = updatedShifts;
    triggerToast(
      `🎮 ${member.name}さん(${role === "kitchen" ? "キッチン" : "ホール"})のシフトを ${targetDate} へ移動しました。`,
    );
    await saveShiftsManually(updatedShifts);
  }

  /**
   * @param {Record<string, boolean>} updatedAvailabilities
   */
  async function autoSaveSubmission(updatedAvailabilities) {
    if (isLocked) return;
    const m = members.find((mem) => mem.id === selectedStaffId);
    if (!m) return;

    isAutoSaving = true;
    hasPendingChanges = true;

    const payload = {
      staffId: m.id,
      period: currentPeriod,
      availabilities: updatedAvailabilities,
      submitPattern: submitPattern,
      lineUserId: currentUser
        ? currentUser.lineUserId
        : m.lineUserId || `U06c755lineUser_${m.id}`,
      submittedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();

      // もし競合シフトが自動削除されて更新された場合、フロントエンドのシフトデータも最新にリロード
      if (data.shiftsUpdated) {
        await loadShifts(currentPeriod);
        triggerToast(`🔄 希望変更に伴い、既存の競合シフトを自動削除しました。`);
      }

      await fetchSubmissions();
      hasPendingChanges = false;
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 自動保存に失敗しました: ${err.message}`);
    } finally {
      isAutoSaving = false;
    }
  }

  /**
   * @param {Record<string, boolean>} updatedAvailabilities
   */
  function debouncedAutoSave(updatedAvailabilities) {
    if (isLocked) return;
    isAutoSaving = true;
    hasPendingChanges = true;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await autoSaveSubmission(updatedAvailabilities);
    }, 500);
  }

  /**
   * @param {string} newPattern
   */
  async function handlePatternSwitch(newPattern) {
    if (isLocked) return;
    submitPattern = newPattern;
    staffAvailabilities = {};
    if (saveTimeout) clearTimeout(saveTimeout);
    await autoSaveSubmission({});
  }

  /**
   * @param {string} dateStr
   */
  function handleToggleAvailability(dateStr) {
    if (isLocked) return;
    const currentVal =
      staffAvailabilities[dateStr] !== undefined
        ? staffAvailabilities[dateStr]
        : submitPattern === "A";

    const updated = {
      ...staffAvailabilities,
      [dateStr]: !currentVal,
    };
    staffAvailabilities = updated;
    debouncedAutoSave(updated);
  }

  const WEEKDAY_NAMES = CALENDAR_HEADERS;
</script>

<div
  class="pb-16 text-slate-800 font-sans select-none selection:bg-[#0071e3]/20"
>
  <!-- Safari PWA 引き戻し案内画面 -->
  {#if showPwaRedirectScreen}
    <div
      class="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-6 text-center text-white font-sans"
    >
      <div class="apple-setup-glow"></div>
      <div class="max-w-sm space-y-6 animate-popup z-10">
        <div
          class="w-20 h-20 bg-[#06c755] rounded-3xl flex items-center justify-center mx-auto shadow-[0_4px_16px_rgba(6,199,85,0.3)] text-white text-4xl font-extrabold select-none"
        >
          L
        </div>
        <h2 class="text-2xl font-black tracking-tight">LINEログインが完了しました</h2>
        <p class="text-xs text-[#86868b] leading-relaxed font-semibold">
          ブラウザでの認証手続きが正常に完了しました。<br />
          ホーム画面の『桃牛苑』アプリへお戻りください。自動的にログイン状態が引き継がれ、アプリが起動します。
        </p>
        
        <div class="pt-6">
          <a
            href={pwaLaunchUrl}
            class="px-8 py-4 bg-white text-black font-extrabold rounded-2xl inline-block shadow-lg hover:bg-[#f5f5f7] active:scale-95 transition-all text-xs tracking-wider"
          >
            PWAアプリを開く
          </a>
        </div>
        
        <p class="text-[9px] text-[#48484a] font-medium leading-relaxed">
          ※自動で戻らない場合は、スマートフォンのホーム画面から直接『桃牛苑』アプリのアイコンをタップして再開してください。
        </p>
      </div>
    </div>
  {/if}

  <!-- トースト -->
  {#if toastMessage}
    <div
      class="fixed top-6 right-6 z-50 animate-popup bg-white border border-slate-200/80 text-slate-800 px-6 py-4 rounded-3xl shadow-xl flex items-center gap-3"
    >
      <Sparkles class="w-5 h-5 text-[#0071e3]" />
      <span class="font-semibold text-xs tracking-wide text-slate-700"
        >{toastMessage}</span
      >
    </div>
  {/if}

  <!-- ========================================================= -->
  <!-- FCM フォアグラウンド通知バナー                               -->
  <!-- アプリが開いている間にプッシュ通知が届いたとき表示する          -->
  <!-- ========================================================= -->
  {#if foregroundNotification}
    <div
      class="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-popup"
      in:fade={{ duration: 200 }}
      out:fade={{ duration: 200 }}
    >
      <div
        class="bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3.5 max-w-sm w-[calc(100vw-3rem)]"
      >
        <!-- 通知アイコン -->
        <div
          class="w-9 h-9 rounded-xl bg-[#06c755] flex items-center justify-center shrink-0 mt-0.5"
        >
          <Bell class="w-4 h-4 text-white" />
        </div>
        <!-- テキスト -->
        <div class="flex-1 min-w-0">
          <p
            class="text-[11px] font-black text-white/60 uppercase tracking-widest mb-0.5"
          >
            桃牛苑シフト
          </p>
          <p class="text-sm font-bold text-white leading-snug">
            {foregroundNotification.title}
          </p>
          <p class="text-xs text-white/70 mt-0.5 leading-relaxed">
            {foregroundNotification.body}
          </p>
        </div>
        <!-- 閉じるボタン -->
        <button
          on:click={() => (foregroundNotification = null)}
          class="text-white/40 hover:text-white/80 transition-colors mt-0.5 shrink-0"
          aria-label="閉じる"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}

  <!-- ========================================================= -->
  <!-- 通知許可プロンプトバナー（初回のみ・未決定の場合のみ表示）    -->
  <!-- ========================================================= -->
  {#if currentUser && fcmPermissionStatus === "idle"}
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-popup"
      in:fade={{ duration: 300 }}
    >
      <div
        class="bg-white border border-slate-200 shadow-2xl rounded-2xl px-5 py-4 flex items-center gap-4 max-w-sm w-[calc(100vw-3rem)]"
      >
        <div
          class="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center shrink-0"
        >
          <Bell class="w-5 h-5 text-[#0071e3]" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-900">
            シフトリマインドを受け取る
          </p>
          <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            締め切り前に自動でお知らせします
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            on:click={() => {
              fcmPermissionStatus = "denied";
            }}
            class="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg transition-colors"
          >
            後で
          </button>
          <button
            on:click={() => requestFcmToken(currentUser?.lineUserId)}
            class="text-[10px] font-bold text-white bg-[#0071e3] hover:bg-[#005bb5] px-3 py-1.5 rounded-lg transition-colors"
          >
            許可する
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Apple Store風セグメントヘッダー -->
  <header
    class="py-4 border-b border-slate-200 sticky top-0 z-40 bg-white/90 backdrop-blur-md shadow-sm"
  >
    <div
      class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2.5">
          <div
            class="w-2.5 h-2.5 rounded-full bg-[#0071e3] shadow-[0_0_10px_rgba(0,113,227,0.5)]"
          ></div>
          <div>
            <h1
              class="text-base font-black tracking-tight text-slate-900 uppercase"
            >
              桃牛苑 シフト管理
            </h1>
          </div>
        </div>

        <select
          bind:value={currentPeriod}
          on:change={handlePeriodChange}
          class="bg-slate-100 hover:bg-slate-200 border-0 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-xl outline-none transition-colors cursor-pointer shadow-sm"
        >
          <option value="2026-06-A">2026年6月 前半 (1日〜15日) </option>
          <option value="2026-06-B">2026年6月 後半 (16日〜末日)</option>
          <option value="2026-07-A">2026年7月 前半 (1日〜15日)</option>
          <option value="2026-07-B">2026年7月 後半 (16日〜末日)</option>
          <option value="2026-08-A">2026年8月 前半 (1日〜15日)</option>
          <option value="2026-08-B">2026年8月 後半 (16日〜末日)</option>
        </select>
      </div>

      <!-- スタイリッシュセグメントタブ ＆ LINEユーザープロフィール -->
      <div
        class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto"
      >
        <div class="segmented-control w-full md:w-[480px]">
          <button
            on:click={() => (activeTab = "calendar")}
            class="segment-btn {activeTab === 'calendar' ? 'active' : ''}"
          >
            シフト表<span class="hidden-mobile">・カレンダー</span>
          </button>
          <button
            on:click={() => (activeTab = "submissions")}
            class="segment-btn {activeTab === 'submissions' ? 'active' : ''}"
          >
            希望提出
          </button>
          <button
            on:click={() => (activeTab = "manager")}
            class="segment-btn {activeTab === 'manager' ? 'active' : ''}"
          >
            管理者<span class="hidden-mobile">設定</span>
          </button>
        </div>

        {#if currentUser}
          <div
            class="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-2xl border border-slate-200/60 animate-popup w-full md:w-auto"
          >
            <div
              class="w-6 h-6 rounded-full bg-[#06c755]/10 flex items-center justify-center text-xs border border-[#06c755]/20 select-none"
            >
              {currentUser.avatar}
            </div>
            <div class="text-left leading-none">
              <div
                class="text-[8px] text-slate-400 font-black uppercase tracking-wider"
              >
                LINE連携中
              </div>
              <div
                class="text-[11px] font-bold text-slate-700 mt-0.5 flex items-center gap-1"
              >
                {currentUser.name}さん
                <span
                  class="text-[7px] bg-[#06c755]/10 text-[#06c755] border border-[#06c755]/20 px-0.5 rounded font-extrabold"
                >
                  {currentUser.roles?.length > 1
                    ? "キッチン/ホール"
                    : currentUser.role === "kitchen"
                      ? "キッチン"
                      : "ホール"}
                </span>
              </div>
            </div>
            <button
              on:click={handleSignOut}
              class="text-[8px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest border border-slate-200 hover:border-red-200 bg-white px-2 py-1 rounded-xl transition-all ml-1 active:scale-95 cursor-pointer"
            >
              終了
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- メインコンテンツ -->
  <main class="max-w-7xl mx-auto px-6 mt-8">
    {#if !currentUser}
      {#if showRegistrationForm}
        <!-- Apple風初回プロフィール自律登録画面 (Pitch Black, Minimalist) -->
        <div class="apple-setup-container" in:fade={{ duration: 250 }}>
          <div class="apple-setup-glow"></div>

          <div class="apple-setup-content">
            <!-- Header -->
            <div class="text-center">
              <div class="apple-setup-logo"></div>
              <h2 class="apple-setup-title">プロフィールの作成</h2>
              <p class="apple-setup-subtitle">
                ようこそ、桃牛苑へ。<br
                />あなたのプロフィールを設定してシフト管理を開始しましょう。
              </p>
            </div>

            <!-- Form -->
            <div class="space-y-6">
              <!-- Name Input -->
              <div class="apple-form-group">
                <label for="reg-name" class="apple-form-label"
                  >お名前 (氏名)</label
                >
                <input
                  id="reg-name"
                  type="text"
                  bind:value={regName}
                  placeholder="桃牛 太郎"
                  class="apple-input-text"
                />
              </div>

              <!-- Roles Selection (Multi-select segmented pill style) -->
              <div class="apple-form-group">
                <span class="apple-form-label">担当タグ (役割)</span>
                <div class="apple-segmented-roles">
                  <button
                    type="button"
                    on:click={() => {
                      if (regRoles.includes("kitchen")) {
                        regRoles = regRoles.filter((r) => r !== "kitchen");
                      } else {
                        regRoles = [...regRoles, "kitchen"];
                      }
                    }}
                    class="apple-role-btn {regRoles.includes('kitchen')
                      ? 'active'
                      : ''}"
                  >
                    <span>🍳</span> キッチン
                  </button>
                  <button
                    type="button"
                    on:click={() => {
                      if (regRoles.includes("hall")) {
                        regRoles = regRoles.filter((r) => r !== "hall");
                      } else {
                        regRoles = [...regRoles, "hall"];
                      }
                    }}
                    class="apple-role-btn {regRoles.includes('hall')
                      ? 'active'
                      : ''}"
                  >
                    <span>🛎</span> ホール
                  </button>
                </div>
                <p class="text-[10px] text-slate-500 font-medium mt-1">
                  ※両方の職種に対応している場合は、両方とも選択できます。
                </p>
              </div>

              <!-- Status Selection (Segmented Control style) -->
              <div class="apple-form-group">
                <span class="apple-form-label">区分 (ステータス)</span>
                <div class="apple-segmented-status">
                  <button
                    type="button"
                    on:click={() => (regStatus = "regular")}
                    class="apple-status-btn {regStatus === 'regular'
                      ? 'active'
                      : ''}"
                  >
                    通常バイト
                  </button>
                  <button
                    type="button"
                    on:click={() => (regStatus = "trainee")}
                    class="apple-status-btn {regStatus === 'trainee'
                      ? 'active'
                      : ''}"
                  >
                    研修中
                  </button>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div>
              <button
                type="button"
                on:click={handleRegisterProfile}
                disabled={isRegistering}
                class="apple-btn-submit"
              >
                {#if isRegistering}
                  <div class="apple-loading-spinner"></div>
                  <span>登録処理中...</span>
                {:else}
                  <span>登録して開始する</span>
                {/if}
              </button>

              <button
                type="button"
                on:click={() => {
                  showRegistrationForm = false;
                  unlinkedLineUserId = null;
                }}
                class="apple-btn-cancel"
              >
                キャンセルして戻る
              </button>
            </div>
          </div>
        </div>
      {:else}
        <!-- LINEログイン画面 (Apple風極上シンプルデザイン) -->
        <div
          class="min-h-[70vh] flex items-center justify-center bg-slate-50 px-6 py-12 animate-popup rounded-3xl border border-slate-200/50 bg-white glass-panel shadow-sm"
          in:fade={{ duration: 150 }}
        >
          <div
            class="max-w-md w-full p-6 flex flex-col items-center text-center space-y-8"
          >
            <div class="space-y-4">
              <div
                class="w-16 h-16 rounded-3xl bg-[#06c755] shadow-[0_4px_16px_rgba(6,199,85,0.25)] flex items-center justify-center text-white text-3xl font-extrabold mx-auto select-none"
              >
                L
              </div>
              <h2 class="text-2xl font-black text-slate-900 tracking-tight">
                桃牛苑 シフト管理
              </h2>
              <p
                class="text-xs text-slate-500 mt-1 leading-relaxed font-semibold"
              >
                LINEアカウントと連携して、シフトの確認や<br />
                スケジュール希望提出をセキュアに行うことができます。
              </p>
            </div>

            {#if isWaitingForPwaLogin}
              <!-- PWAログイン待機画面 -->
              <div
                class="w-full py-8 flex flex-col items-center justify-center space-y-6"
              >
                <div
                  class="w-10 h-10 rounded-full border-3 border-slate-100 border-t-[#0071e3] animate-spin"
                ></div>
                <div class="space-y-2">
                  <p class="text-xs font-bold text-slate-700">
                    ブラウザでのLINEログイン完了を待っています...
                  </p>
                  <p class="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    ブラウザでの認証完了後、自動的にこのアプリにログインします。<br />
                    完了したらホーム画面のこのアプリにお戻りください。
                  </p>
                </div>
                <button
                  type="button"
                  on:click={cancelPwaLogin}
                  class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-500 rounded-xl transition-all cursor-pointer"
                >
                  ログインをキャンセル
                </button>
              </div>
            {:else if isAuthenticating}
              <!-- 認証中のローディング表示 -->
              <div
                class="w-full py-12 flex flex-col items-center justify-center space-y-4"
              >
                <div
                  class="w-8 h-8 rounded-full border-2 border-slate-200 border-t-[#06c755] animate-spin"
                ></div>
                <p class="text-xs text-slate-400 font-bold tracking-tight">
                  LINE認証を行っています...
                </p>
              </div>
            {:else}
              <div class="w-full space-y-5">
                {#if authErrorMessage}
                  <!-- LINEアカウント未連携 / エラー表示 -->
                  <div
                    class="w-full bg-red-50/50 border border-red-100 p-5 rounded-2xl text-left space-y-3 animate-popup"
                  >
                    <span
                      class="text-[9px] font-black text-red-500 uppercase tracking-widest block"
                      >エラーが発生しました</span
                    >
                    <p
                      class="text-xs text-slate-600 leading-relaxed font-medium"
                    >
                      {authErrorMessage}
                    </p>
                    <button
                      on:click={() => {
                        authErrorMessage = null;
                        unlinkedLineUserId = null;
                      }}
                      class="w-full py-2.5 bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.99] cursor-pointer"
                    >
                      ログイン画面に戻る
                    </button>
                  </div>
                {:else}
                  <!-- LINEサインイン（本物） -->
                  <button
                    on:click={handleLineLogin}
                    class="w-full py-4 bg-[#06c755] hover:bg-[#05b34c] text-white text-xs font-bold rounded-2xl transition-all shadow-[0_4px_12px_rgba(6,199,85,0.15)] hover:translate-y-[0.5px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path
                        d="M24 10.3c0-5.7-5.4-10.3-12-10.3s-12 4.6-12 10.3c0 5.1 4.3 9.3 10.1 10.1.4.1.9.3 1 .7.1.3 0 .7-.1 1l-.4 2.5c-.1.5.2.9.6 1 .1 0 .2 0 .3 0 .4 0 .8-.2 1.1-.6l3.3-3.9c.3-.3.5-.5.9-.6 5.3-.9 9.2-4.9 9.2-9.2z"
                      />
                    </svg>
                    LINE アカウントでサインイン
                  </button>

                  <p
                    class="text-[9px] text-slate-500 font-medium leading-relaxed"
                  >
                    ※LINEプラットフォームの認可を受けたセキュアなログインを行います。<br
                    />
                    初めての方は、ログイン後に「お名前・役割・区分」のプロフィール自律登録を行います。
                  </p>


                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <!-- ========================================================================= -->
      <!-- 【メイン画面】シフト表・カレンダー (Apple Store風 7列月間カレンダー)             -->
      <!-- ========================================================================= -->
      {#if activeTab === "calendar"}
        <div class="space-y-6" in:fade={{ duration: 150 }}>
          {#if (!currentUser || !currentUser.isAdmin) && shiftStatus === "draft"}
            <!-- 一般スタッフ向け「下書き・調整中」マスク (Apple風極上グラスモーフィズム) -->
            <div
              class="glass-panel min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-200/50 relative overflow-hidden space-y-6 rounded-3xl"
              in:fade={{ duration: 150 }}
            >
              <div
                class="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 text-3xl shadow-sm animate-pulse mx-auto select-none"
              >
                ⏰
              </div>
              <div class="space-y-2 max-w-sm mx-auto">
                <h3
                  class="text-base font-extrabold text-slate-900 tracking-tight"
                >
                  ただいま店長がシフト調整中です
                </h3>
                <p class="text-xs text-slate-400 font-semibold leading-relaxed">
                  現在、店長が来月のシフト表をパズル調整しています。<br />
                  確定し、公開されるとLINEグループに通知が届きます。今しばらくお待ちください
                  
                </p>
              </div>
            </div>
          {:else}
            <!-- スマホ専用 横画面回転ガイド案内 -->
            <div class="mobile-landscape-tip flex items-center gap-2">
              <span>💡</span>
              <span
                >スマホを横向き（ランドスケープ）に回転させると、カレンダー全体がより広く見やすくなります。</span
              >
            </div>

            <!-- スタッフフィルター (ネオンハイライトトリガー) -->
            <div
              class="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white"
            >
              <div>
                <h2
                  class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5"
                >
                  <Sparkles class="w-4 h-4 text-[#0071e3]" />
                  個人シフト表示
                </h2>
                <p class="text-xs text-slate-500 mt-0.5 font-medium">
                  名前を選択してハイライト、または「自分だけ」に絞り込んで表示できます。
                </p>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <!-- 自分だけ表示トグルボタン -->
                <button
                  id="my-shifts-toggle"
                  on:click={() => {
                    showMyShiftsOnly = !showMyShiftsOnly;
                  }}
                  disabled={!currentUser}
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold border transition-all duration-200 {!currentUser
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : showMyShiftsOnly
                      ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-[0_4px_14px_rgba(0,113,227,0.35)] scale-[1.02]'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-[#0071e3] hover:text-[#0071e3]'}"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  {showMyShiftsOnly ? "自分だけ表示中" : "自分だけ表示"}
                </button>
              </div>
            </div>

            <!-- 2カラムレイアウト -->
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <!-- 左側: 35マスカレンダー (3/4幅) -->
              <div class="lg:col-span-3 space-y-3">
                <!-- 曜日のヘッダー (日曜始まり) -->
                <div
                  class="grid grid-cols-7 gap-3 text-center text-xs font-bold text-slate-400 uppercase tracking-widest"
                >
                  {#each CALENDAR_HEADERS as h}
                    <div class="py-2">{h}</div>
                  {/each}
                </div>

                <!-- 日付グリッド -->
                <div class="grid grid-cols-7 gap-3">
                  {#each GRID_CELLS as d}
                    {@const isRegularClosed = d.isRegularClosed}
                    {@const isSpecialClosed = specialHolidays.includes(
                      d.dateStr,
                    )}
                    {@const isClosed = isRegularClosed || isSpecialClosed}
                    {@const allShifts = shifts.filter(
                      (s) => s.date === d.dateStr,
                    )}
                    {@const todayShifts =
                      showMyShiftsOnly && currentUser
                        ? allShifts.filter(
                            (s) => s.member_id === currentUser?.id,
                          )
                        : allShifts}

                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      on:click={() => {
                        if (d.isOtherMonth) return;
                        if (isRegularClosed) {
                          triggerToast("毎週水曜日は店舗定休日です。");
                          return;
                        }
                        selectedEditDate = d.dateStr;
                      }}
                      class="glass-panel p-4 min-h-[160px] flex flex-col justify-between relative bg-white cursor-pointer {d.isOtherMonth
                        ? 'other-month-cell'
                        : ''} {isClosed && !d.isOtherMonth
                        ? 'opacity-40 bg-slate-50 border-dashed shadow-none cursor-pointer'
                        : ''}"
                    >
                      <!-- 上部: 日付タイポグラフィ -->
                      <div>
                        <div class="flex items-start justify-between">
                          <span class="day-number text-xl">
                            {d.dayNum}
                            <span
                              class="text-[9px] text-slate-400 font-bold ml-1 uppercase"
                              >({d.wName})</span
                            >
                          </span>
                        </div>

                        <!-- 出勤者のカプセルリスト -->
                        <div class="mt-3.5 space-y-1.5">
                          {#if d.isOtherMonth}
                            <!-- 前月・翌月は空欄 -->
                          {:else if isClosed}
                            <span
                              class="text-[10px] text-slate-400 block mt-3.5 font-bold text-center"
                            >
                              {isRegularClosed ? "定休日" : "臨時休業"}
                            </span>
                          {:else if todayShifts.length === 0}
                            <span
                              class="text-[10px] text-slate-400 block mt-3.5 font-bold text-center"
                              >未配置</span
                            >
                          {:else}
                            {#each todayShifts as s}
                              {@const m = members.find(
                                (mem) => mem.id === s.member_id,
                              )}
                              {@const isTrainee = m?.status === "trainee"}
                              {@const isHighlighted =
                                s.member_id === highlightMemberId}

                              <div
                                class="staff-pill {s.role === 'kitchen'
                                  ? 'kitchen-pill'
                                  : 'hall-pill'} {isTrainee
                                  ? 'trainee-pill'
                                  : ''} {isHighlighted
                                  ? 'neon-highlight'
                                  : ''} flex items-center justify-center gap-0.5 text-[11px] font-extrabold px-1.5 py-0.5 rounded-md"
                              >
                                <span class="truncate"
                                  >{getMemberInitial(
                                    s.member_name,
                                    members,
                                  )}</span
                                >
                                <span class="text-[9px] scale-90"
                                  >{s.role === "kitchen" ? "🍳" : "🛎️"}</span
                                >
                                {#if isTrainee}
                                  <span class="text-[9px] scale-90">🔰</span>
                                {/if}
                                {#if s.isLocked}
                                  <span class="text-[8px] scale-90">🔒</span>
                                {/if}
                              </div>
                            {/each}
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- 右側: アシスタントサイドバー (1/4幅) -->
              <div class="space-y-6">
                <!-- 給与・優先度アシスト -->
                <div class="glass-panel p-6 space-y-6 bg-white sticky top-24">
                  <div>
                    <h3
                      class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2"
                    >
                      <Users class="w-4 h-4 text-[#0071e3]" />
                      給与・優先度アシスト
                    </h3>
                    <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      当期間の出勤状況をリアルタイムに集計します。
                    </p>
                  </div>

                  <!-- AI自動生成カード (スクリーンショット同様) -->
                  <div
                    class="bg-slate-50 p-4.5 rounded-xl border border-slate-100 text-xs space-y-3"
                  >
                    <div class="flex items-center justify-between">
                      <span class="font-bold text-slate-700"
                        >自動生成 (AI最適マッピング)</span
                      >
                      <span
                        class="flex items-center gap-1.5 font-bold text-emerald-600"
                      >
                        <span
                          class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34c759]"
                        ></span> 充足完了
                      </span>
                    </div>
                    <p
                      class="text-[10px] text-slate-500 font-medium leading-relaxed"
                    >
                      毎週水曜日の定休日、スタッフ別の目標出勤日数、および研修生の土日出勤の平準化ルールがすべて満たされています。
                    </p>
                  </div>

                  <!-- スタッフ状況リスト -->
                  <div class="space-y-3">
                    <span
                      class="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
                      >メンバー稼働状況</span
                    >
                    {#each memberAssignedStats as m}
                      <div
                        class="sidebar-staff-item flex items-center justify-between"
                      >
                        <div>
                          <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-slate-800"
                              >{m.emoji} {m.name}</span
                            >
                            <span
                              class="hope-status-badge {m.status === 'trainee'
                                ? 'badge-on'
                                : 'badge-none'} text-[8px] py-0.5 px-1.5"
                            >
                              {m.statusName}
                            </span>
                          </div>

                          <p
                            class="text-[9px] text-slate-400 mt-0.5 font-medium"
                          >
                            {#if m.status === "trainee"}
                              土日のみアサイン可能
                            {:else}
                              見積もり給与: ¥{(
                                m.count *
                                5 *
                                1050
                              ).toLocaleString()} (5h/日)
                            {/if}
                          </p>
                        </div>

                        <div class="text-right">
                          <span class="text-xs font-bold text-slate-800">
                            {m.count}日出勤
                          </span>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- ========================================================================= -->
      <!-- 【希望提出画面】スケジュール希望提出 (カレンダー形式タップ選択)              -->
      <!-- ========================================================================= -->
      {#if activeTab === "submissions"}
        <div class="space-y-6" in:fade={{ duration: 150 }}>
          <!-- スマホ専用 横画面回転ガイド案内 -->
          <div class="mobile-landscape-tip flex items-center gap-2">
            <span>💡</span>
            <span
              >スマホを横向き（ランドスケープ）に回転させると、希望カレンダー全体がより広く見やすくなります。</span
            >
          </div>

          <div
            class="glass-panel p-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white"
          >
            <div>
              <h2
                class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5"
              >
                <Calendar class="w-4 h-4 text-[#0071e3]" />
                カレンダーで希望提出
              </h2>
              <p class="text-xs text-slate-500 mt-0.5 font-medium">
                カレンダーの日付をタップして休み希望（または出勤可能日）をスマートに設定・提出します。
              </p>
            </div>

            <div class="flex items-center gap-3.5">
              <div
                class="flex items-center gap-1.5 bg-slate-100/60 border border-slate-200/50 rounded-full px-4.5 py-2 text-xs font-bold text-slate-700 select-none"
              >
                <span>{currentUser?.avatar || "🧑‍🍳"}</span>
                <span>{currentUser?.name || "ゲスト"} さん</span>
              </div>

              <div class="segmented-control w-[180px]">
                <button
                  on:click={() => handlePatternSwitch("A")}
                  class="segment-btn {submitPattern === 'A' ? 'active' : ''}"
                  disabled={isLocked}
                >
                  休み希望
                </button>
                <button
                  on:click={() => handlePatternSwitch("B")}
                  class="segment-btn {submitPattern === 'B' ? 'active' : ''}"
                  disabled={isLocked}
                >
                  可能日
                </button>
              </div>
            </div>
          </div>

          <!-- 2カラムレイアウト -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <!-- 左側: カレンダー提出ボード -->
            <div class="lg:col-span-3 space-y-3">
              <!-- 曜日のヘッダー -->
              <div
                class="grid grid-cols-7 gap-3 text-center text-xs font-bold text-slate-400 uppercase tracking-widest"
              >
                {#each CALENDAR_HEADERS as h}
                  <div class="py-2">{h}</div>
                {/each}
              </div>

              <!-- 日付グリッド (35マス) -->
              <div class="grid grid-cols-7 gap-3">
                {#each GRID_CELLS as d}
                  {@const isRegularClosed = d.isRegularClosed}
                  {@const isClosed =
                    isRegularClosed || specialHolidays.includes(d.dateStr)}

                  {@const currentPattern = submitPattern}
                  {@const isAvail =
                    staffAvailabilities[d.dateStr] !== undefined
                      ? staffAvailabilities[d.dateStr]
                      : currentPattern === "A"}

                  <button
                    type="button"
                    on:click={() => {
                      if (!d.isOtherMonth && !isClosed && !isLocked) {
                        handleToggleAvailability(d.dateStr);
                      }
                    }}
                    disabled={d.isOtherMonth || isClosed || isLocked}
                    class="glass-panel hope-calendar-cell p-4 flex flex-col justify-between text-left bg-white {d.isOtherMonth
                      ? 'other-month-cell'
                      : ''} {!d.isOtherMonth && (isClosed || isLocked)
                      ? 'locked-cell'
                      : ''} {!d.isOtherMonth &&
                    !isClosed &&
                    !isLocked &&
                    currentPattern === 'A' &&
                    !isAvail
                      ? 'hope-off-cell'
                      : ''} {!d.isOtherMonth &&
                    !isClosed &&
                    !isLocked &&
                    currentPattern === 'B' &&
                    isAvail
                      ? 'hope-on-cell'
                      : ''}"
                  >
                    <!-- 上部: 日付 -->
                    <div class="flex items-start justify-between w-full">
                      <span class="day-number text-lg">
                        {d.dayNum}
                        <span
                          class="text-[9px] text-slate-400 font-bold ml-1 uppercase"
                          >({d.wName})</span
                        >
                      </span>
                    </div>

                    <!-- 下部: ステータス表示 -->
                    <div class="mt-4">
                      {#if d.isOtherMonth}
                        <!-- 空 -->
                      {:else if isRegularClosed}
                        <span class="hope-status-badge badge-none">定休日</span>
                      {:else if specialHolidays.includes(d.dateStr)}
                        <span class="hope-status-badge badge-none"
                          >臨時休業</span
                        >
                      {:else if isLocked}
                        <span class="hope-status-badge badge-none"
                          >🔒 締切ロック</span
                        >
                      {:else if currentPattern === "A"}
                        {#if !isAvail}
                          <span class="hope-status-badge badge-off"
                            >休み希望</span
                          >
                        {:else}
                          <span class="hope-status-badge badge-none"
                            >出勤 (通常)</span
                          >
                        {/if}
                      {:else if currentPattern === "B"}
                        {#if isAvail}
                          <span class="hope-status-badge badge-on"
                            >出勤可能</span
                          >
                        {:else}
                          <span class="hope-status-badge badge-none"
                            >お休み</span
                          >
                        {/if}
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>

              <div class="flex justify-center pt-4">
                <div
                  class="flex flex-col items-center justify-center w-full md:w-[450px] gap-3"
                >
                  {#if isLocked}
                    <!-- ロック時のプレミアム表示 -->
                    <div
                      class="w-full glass-panel p-5 border border-slate-200/60 bg-slate-50/60 rounded-3xl flex flex-col items-center gap-2 text-center shadow-sm"
                    >
                      <span
                        class="text-xs font-bold text-slate-500 flex items-center gap-1.5 animate-pulse"
                      >
                        🔒 希望シフトの提出は締め切られました
                      </span>
                      <span
                        class="text-[10px] text-slate-400 leading-relaxed font-semibold"
                      >
                        提出締め切り日時 ({new Date(
                          deadlineDate,
                        ).toLocaleString()})
                        を過ぎたため、閲覧のみとなっております。変更は店長へ直接ご相談ください。
                      </span>
                    </div>
                  {:else}
                    <!-- 締め切り前のオートセーブステータスカード -->
                    <div
                      class="w-full glass-panel p-5 border border-slate-200/60 bg-white rounded-3xl flex flex-col items-center gap-2 text-center shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <div
                        class="flex items-center gap-2 text-xs font-bold text-slate-800"
                      >
                        {#if isAutoSaving || hasPendingChanges}
                          <span
                            class="w-4 h-4 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin"
                          ></span>
                          <span class="text-[#0071e3]"
                            >希望スケジュールを自動保存中...</span
                          >
                        {:else}
                          <span class="relative flex h-2.5 w-2.5">
                            <span
                              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                            ></span>
                            <span
                              class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"
                            ></span>
                          </span>
                          <span class="text-emerald-600"
                            >希望シフトはリアルタイムに自動保存されています </span
                          >
                        {/if}
                      </div>
                      <span
                        class="text-[10px] text-slate-400 leading-relaxed font-semibold"
                      >
                        カレンダーの日付をタップするだけで、店長側のデータベースに即座に反映されます。
                        <br />
                        ⏰ 提出締め切り: {new Date(
                          deadlineDate,
                        ).toLocaleString()} まで何回でも変更可能です。
                      </span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <!-- 右側: ガイドサイドバー -->
            <div class="space-y-6">
              <div class="glass-panel p-6 space-y-5 bg-white sticky top-24">
                <div>
                  <h3
                    class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2"
                  >
                    <Smartphone class="w-4 h-4 text-[#0071e3]" />
                    提出アシスト
                  </h3>
                  <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    カレンダーから日付をタップするだけで、自分の希望スケジュールを迅速に提出できます。
                  </p>
                </div>

                <!-- ルールリマインド -->
                <div
                  class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[11px] space-y-2.5"
                >
                  <span class="font-bold text-slate-700 block"
                    >桃牛苑 提出ガイドライン</span
                  >
                  <ul
                    class="space-y-1.5 text-[10px] text-slate-500 list-disc list-inside"
                  >
                    <li>通常バイトの目標は月10日です。</li>
                    <li>毎週水曜日は定休日です。</li>
                    <li>
                      研修生は土日のみ出勤可能です。平日は自動ロックされます。
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- ========================================================================= -->
      <!-- 【管理者画面】管理者ダッシュボード (2カラム ＆ 極小ステータスドット)              -->
      <!-- ========================================================================= -->
      {#if activeTab === "manager"}
        {#if !currentUser.isAdmin}
          <!-- 管理者権限ロック (Apple風極上シンプルデザイン) -->
          <div
            class="min-h-[60vh] flex items-center justify-center bg-slate-50 px-6 py-12 animate-popup rounded-3xl border border-slate-200/50 bg-white glass-panel shadow-sm mt-8"
            in:fade={{ duration: 150 }}
          >
            <div
              class="max-w-md w-full p-6 flex flex-col items-center text-center space-y-6"
            >
              <div
                class="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 border border-rose-100 text-3xl mx-auto shadow-sm select-none"
              >
                🔒
              </div>
              <div class="space-y-2">
                <h3 class="text-lg font-black text-slate-900 tracking-tight">
                  管理者権限が必要です
                </h3>
                <p class="text-xs text-slate-400 font-semibold leading-relaxed">
                  現在サインイン中のアカウント（{currentUser.name}さん）には、<br
                  />
                  シフトの最終生成や店舗設定を行う管理者権限がありません。
                </p>
              </div>
            </div>
          </div>
        {:else}
          <!-- スマホ専用 横画面回転ガイド案内 -->
          <div class="mobile-landscape-tip flex items-center gap-2">
            <span>💡</span>
            <span
              >スマホを横向き（ランドスケープ）に回転させると、調整ボードが広く使いやすくなります。</span
            >
          </div>

          <div
            class="grid grid-cols-1 lg:grid-cols-4 gap-8"
            in:fade={{ duration: 150 }}
          >
            <!-- 左側: システムコントロール (1/4幅) -->
            <div class="space-y-6">
              <div class="glass-panel p-6 space-y-6 bg-white">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 tracking-tight">
                    シフト作成・設定パネル
                  </h3>
                  <p class="text-xs text-slate-500 mt-0.5 font-medium">
                    臨時定休の設定と自動生成を実行します。
                  </p>
                </div>

                <!-- ステータス (極小ドット) -->
                <div
                  class="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs font-semibold"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">自動マッピングステータス</span>
                    <span
                      class="flex items-center gap-2 font-bold text-slate-700"
                    >
                      {#if isAllShiftsValid}
                        <span
                          class="w-2 h-2 rounded-full bg-[#34c759] shadow-[0_0_8px_#34c759]"
                        ></span> 充足完了
                      {:else}
                        <span
                          class="w-2 h-2 rounded-full bg-[#ff3b30] shadow-[0_0_8px_#ff3b30] animate-pulse"
                        ></span> 要調整
                      {/if}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">未提出メンバー</span>
                    <span
                      class="flex items-center gap-2 font-bold text-slate-700"
                    >
                      {#if unsubmittedCount === 0}
                        <span
                          class="w-2 h-2 rounded-full bg-[#34c759] shadow-[0_0_8px_#34c759]"
                        ></span> 全員提出済み
                      {:else}
                        <span
                          class="w-2 h-2 rounded-full bg-[#ff9500] shadow-[0_0_8px_#ff9500]"
                        ></span> <span title={unsubmittedMembers.map(m => m.name).join(', ')}>{unsubmittedCount}名 (要通知)</span>
                      {/if}
                    </span>
                  </div>
                </div>

                <!-- 操作ボタン -->
                <div class="space-y-3">
                  <button
                    on:click={handleReGenerate}
                    disabled={isGenerating}
                    class="w-full btn-apple btn-primary py-3.5 text-xs font-bold"
                  >
                    <RotateCcw
                      class="w-4 h-4 {isGenerating ? 'animate-spin' : ''}"
                    />
                    {isGenerating ? "自動生成中..." : "AI自動シフト生成を実行"}
                  </button>

                  <button
                    on:click={handleSendRemind}
                    class="w-full btn-apple btn-secondary py-3.5 text-xs"
                  >
                    <Bell class="w-4 h-4 text-[#0071e3]" />
                    提出リマインドをLINE一斉配信
                  </button>
                </div>

                <!-- 公開ステータスと確定公開ボタン -->
                <div
                  class="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3"
                >
                  <div
                    class="flex items-center justify-between text-xs font-semibold"
                  >
                    <span class="text-slate-500">公開ステータス</span>
                    {#if shiftStatus === "published"}
                      <span
                        class="flex items-center gap-1.5 font-bold text-emerald-600"
                      >
                        <span
                          class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34c759]"
                        ></span> 公開済み
                      </span>
                    {:else}
                      <span
                        class="flex items-center gap-1.5 font-bold text-amber-500"
                      >
                        <span
                          class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#ff9500]"
                        ></span> 下書き (調整中)
                      </span>
                    {/if}
                  </div>

                  {#if shiftStatus === "published"}
                    <button
                      on:click={() => revertShiftsToDraft(currentPeriod)}
                      class="w-full btn-apple btn-secondary py-2.5 text-[11px] font-bold text-slate-500 hover:text-slate-700"
                    >
                      ✏️ シフトを下書きに戻す
                    </button>
                  {:else}
                    <button
                      on:click={() => publishShifts(currentPeriod)}
                      class="w-full btn-apple bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white py-3 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                    >
                      💚 シフトを確定してスタッフに公開 
                    </button>
                  {/if}
                </div>

                <!-- 一括設定 -->
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span
                    class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2"
                    >曜日別 一括休業設定</span
                  >
                  <div class="grid grid-cols-7 gap-1.5 mt-3">
                    {#each WEEKDAY_NAMES as w}
                      <button
                        on:click={() => {
                          if (w === "水") {
                            triggerToast(
                              "⚠️ 水曜日は基本定休日のため、解除はできません。",
                            );
                          } else {
                            selectedBulkClosedDay = w;
                          }
                        }}
                        class="py-2 text-[10px] font-bold rounded-lg border text-center transition-all {w ===
                        '水'
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}"
                      >
                        {w}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- シフト提出締め切り設定 (Apple風カスタム設定カード) -->
                <div
                  class="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3"
                >
                  <span
                    class="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
                    >シフト提出締め切り設定</span
                  >
                  <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    これより後のシフト希望の提出・変更を完全にロックします。
                  </p>
                  <div class="flex flex-col gap-2.5">
                    <input
                      type="datetime-local"
                      bind:value={deadlineInput}
                      class="bg-white border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:border-[#0071e3]"
                    />
                    <button
                      on:click={handleUpdateDeadline}
                      class="btn-apple btn-secondary py-2 text-[10px] font-bold"
                    >
                      締め切り日時を保存
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右側: 直感的シフトカレンダーボード (3/4幅) -->
            <div class="lg:col-span-3 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 tracking-tight">
                    シフト手動パズル調整ボード
                  </h3>
                  <p class="text-xs text-slate-500 mt-0.5 font-medium">
                    カレンダー上のスタッフピルをドラッグして他の日へ移動・修正できます。
                  </p>
                </div>
              </div>

              <!-- カレンダーグリッド (35マス) -->
              <div class="space-y-3">
                <!-- 曜日別一括ボタン -->
                <div class="grid grid-cols-7 gap-2.5">
                  {#each CALENDAR_HEADERS as w}
                    <button
                      on:click={() => (selectedBulkClosedDay = w)}
                      class="bg-slate-100 text-slate-500 hover:bg-[#ff3b30] hover:text-white font-extrabold text-[10px] py-2 rounded-xl border border-slate-200 hover:translate-y-[1px] text-center"
                    >
                      {w}<span class="hidden-mobile">一括</span>
                    </button>
                  {/each}
                </div>

                <!-- 日付グリッド (35マス) -->
                <div class="grid grid-cols-7 gap-2.5">
                  {#each GRID_CELLS as d}
                    {@const isRegularClosed = d.isRegularClosed}
                    {@const isClosed =
                      isRegularClosed || specialHolidays.includes(d.dateStr)}
                    {@const todayShifts = shifts.filter(
                      (s) => s.date === d.dateStr,
                    )}
                    {@const val = validationResults[d.dateStr] || {
                      isValid: true,
                    }}
                    {@const isOver = dragOverDate === d.dateStr}

                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      on:dragover={(e) =>
                        !d.isOtherMonth && handleDragOver(e, d.dateStr)}
                      on:dragenter={() =>
                        !d.isOtherMonth &&
                        !isClosed &&
                        (dragOverDate = d.dateStr)}
                      on:dragleave={() => (dragOverDate = null)}
                      on:drop={(e) =>
                        !d.isOtherMonth && handleDrop(e, d.dateStr)}
                      on:click={() => {
                        if (d.isOtherMonth) return;
                        if (isRegularClosed) {
                          triggerToast("毎週水曜日は店舗定休日です。");
                          return;
                        }
                        selectedEditDate = d.dateStr;
                      }}
                      class="flat-cal-cell p-3.5 min-h-[145px] flex flex-col justify-between relative bg-white cursor-pointer {d.isOtherMonth
                        ? 'other-month-cell'
                        : ''} {isClosed && !d.isOtherMonth
                        ? 'bg-red-50/20 border-red-100/50 opacity-60 shadow-none cursor-pointer'
                        : 'cursor-pointer'} {isOver
                        ? 'bg-[#0071e3]/5 border-[#0071e3]/30'
                        : ''} {!val.isValid && !isClosed && !d.isOtherMonth
                        ? 'border-red-500/20'
                        : ''}"
                    >
                      <div>
                        <div class="flex items-center justify-between">
                          <span
                            class="text-xs font-extrabold {d.isWeekend
                              ? 'text-red-500'
                              : 'text-slate-700'}"
                          >
                            {d.dayNum}
                            <span class="text-[9px] text-slate-400 font-bold"
                              >({d.wName})</span
                            >
                          </span>

                          <div class="flex items-center gap-1.5">
                            {#if !val.isValid && !isClosed && !d.isOtherMonth}
                              <span
                                class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"
                              ></span>
                            {/if}
                          </div>
                        </div>

                        <!-- ピルバッジリスト -->
                        <div class="mt-3 space-y-1.5">
                          {#if d.isOtherMonth}
                            <!-- 前月・翌月は空欄 -->
                          {:else if isClosed}
                            <span
                              class="text-[9px] text-slate-400 block mt-4 font-bold text-center"
                            >
                              {isRegularClosed ? "定休日" : "臨時休業"}
                            </span>
                          {:else if todayShifts.length === 0}
                            <span
                              class="text-[9px] text-slate-400 block mt-4 font-bold text-center"
                              >未配置</span
                            >
                          {:else}
                            {#each todayShifts as s}
                              {@const m = members.find(
                                (mem) => mem.id === s.member_id,
                              )}
                              {@const isTrainee = m?.status === "trainee"}

                              <!-- svelte-ignore a11y_click_events_have_key_events -->
                              <!-- svelte-ignore a11y_no_static_element_interactions -->
                              <div
                                draggable="true"
                                on:dragstart={(e) =>
                                  handleDragStart(
                                    e,
                                    s.member_id,
                                    d.dateStr,
                                    s.role,
                                  )}
                                on:dragend={handleDragEnd}
                                on:click|stopPropagation
                                class="draggable-pill staff-pill {s.role ===
                                'kitchen'
                                  ? 'kitchen-pill'
                                  : 'hall-pill'} {isTrainee
                                  ? 'trainee-pill'
                                  : ''} flex items-center justify-center gap-0.5 text-[11px] font-extrabold px-1.5 py-0.5 rounded-md"
                              >
                                <span
                                  >{getMemberInitial(
                                    s.member_name,
                                    members,
                                  )}</span
                                >
                                <span class="text-[9px] scale-90"
                                  >{s.role === "kitchen" ? "🍳" : "🛎️"}</span
                                >
                                {#if isTrainee}
                                  <span class="text-[9px] scale-90">🔰</span>
                                {/if}
                                {#if s.isLocked}
                                  <span class="text-[8px] scale-90">🔒</span>
                                {/if}
                              </div>
                            {/each}
                          {/if}
                        </div>
                      </div>

                      {#if !val.isValid && !isClosed && !d.isOtherMonth}
                        <p
                          class="text-[8px] text-red-500 font-extrabold leading-none mt-1.5"
                        >
                          {val.message}
                        </p>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </main>

  <!-- モーダル: 曜日一括設定 -->
  {#if selectedBulkClosedDay}
    <div class="apple-modal-overlay" transition:fade={{ duration: 120 }}>
      <div
        class="glass-panel p-6 max-w-sm w-full animate-popup bg-white shadow-2xl relative text-center border border-slate-200"
      >
        <button
          on:click={() => (selectedBulkClosedDay = null)}
          class="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X class="w-5 h-5" />
        </button>

        <h4 class="text-sm font-bold text-slate-900 tracking-tight mb-4">
          毎週{selectedBulkClosedDay}曜日の一括設定
        </h4>
        <p class="text-xs text-slate-600 leading-relaxed mb-6 font-semibold">
          6月内のすべての【{selectedBulkClosedDay}曜日】を一括で臨時休業に登録（または解除）しますか？
        </p>

        <div class="flex gap-4">
          <button
            on:click={() => handleBulkClosedSetting(selectedBulkClosedDay)}
            class="flex-1 btn-apple btn-primary py-3 text-xs"
          >
            実行する
          </button>
          <button
            on:click={() => (selectedBulkClosedDay = null)}
            class="flex-1 btn-apple btn-secondary py-3 text-xs"
          >
            やめる
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Apple風詳細ボトムシート (モーダル兼用) -->
  {#if selectedEditDate}
    {@const dateParts = selectedEditDate.split("-")}
    {@const monthNum = parseInt(dateParts[1])}
    {@const dayNum = parseInt(dateParts[2])}
    {@const isHoliday = specialHolidays.includes(selectedEditDate)}
    {@const isRegularClosed = DATES.find(
      (d) => d.dateStr === selectedEditDate,
    )?.isRegularClosed}
    {@const dateShifts = shifts.filter((s) => s.date === selectedEditDate)}

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="apple-bottom-sheet-overlay"
      on:click={() => (selectedEditDate = null)}
      transition:fade={{ duration: 150 }}
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="apple-bottom-sheet" on:click|stopPropagation>
        <div class="bottom-sheet-handle"></div>

        <button
          on:click={() => (selectedEditDate = null)}
          class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 focus:outline-none"
          aria-label="閉じる"
        >
          <X class="w-5 h-5" />
        </button>

        <h4 class="text-sm font-black text-slate-900 mb-4 tracking-tight">
          {monthNum}月{dayNum}日 のシフト詳細
        </h4>

        {#if currentUser?.isAdmin}
          <!-- 管理者（店長）向け編集ビュー -->
          <div
            class="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between mb-5 text-xs font-semibold"
          >
            <div>
              <p class="font-bold text-slate-800">臨時休業日に設定</p>
              <p class="text-[10px] text-slate-500 font-medium mt-0.5">
                自動生成の対象から除外されます。
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-label="臨時休業日に設定"
              aria-checked={isHoliday}
              on:click={() => toggleSpecialHoliday(selectedEditDate)}
              class="ios-switch {isHoliday ? 'ios-switch-active' : ''}"
            >
              <div class="ios-switch-knob"></div>
            </button>
          </div>

          {#if !isHoliday && !isRegularClosed}
            <div class="space-y-4">
              <p
                class="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
              >
                出勤メンバー
              </p>

              <div class="space-y-2 max-h-[220px] overflow-y-auto">
                {#if dateShifts.length === 0}
                  <p
                    class="text-xs text-slate-500 py-6 text-center font-medium"
                  >
                    アサインメンバーはいません。
                  </p>
                {:else}
                  {#each dateShifts as s}
                    {@const m = members.find((mem) => mem.id === s.member_id)}
                    {@const isTrainee = m?.status === "trainee"}
                    <div
                      class="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 gap-2"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span
                            class="text-xs font-bold text-slate-800 truncate"
                            >{s.member_name}</span
                          >
                          {#if isTrainee}
                            <span
                              class="bg-amber-100 text-amber-800 text-[9px] px-1 rounded font-bold shrink-0"
                              >🔰</span
                            >
                          {/if}
                        </div>
                        <p class="text-[10px] text-slate-500 mt-0.5">
                          {s.role === "kitchen" ? "🍳 キッチン" : "🛎️ ホール"}
                        </p>
                      </div>

                      <div class="flex items-center gap-1.5 shrink-0">
                        <!-- 南京錠ロックトグル -->
                        <button
                          on:click={async () => {
                            s.isLocked = !s.isLocked;
                            shifts = [...shifts];
                            await saveShiftsManually(shifts);
                          }}
                          class="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-lg text-slate-700 flex items-center gap-0.5"
                          title={s.isLocked
                            ? "アサイン固定中 (クリックで解除)"
                            : "アサインを固定する"}
                        >
                          <span>{s.isLocked ? "🔒" : "🔓"}</span>
                          <span class="hidden sm:inline"
                            >{s.isLocked ? "固定中" : "固定"}</span
                          >
                        </button>

                        <button
                          on:click={async () => {
                            const nextTime =
                              s.start_time === "17:00" ? "17:30" : "17:00";
                            const updatedShifts = shifts.map((item) => {
                              if (
                                item.date === selectedEditDate &&
                                item.member_id === s.member_id
                              ) {
                                return { ...item, start_time: nextTime };
                              }
                              return item;
                            });
                            shifts = updatedShifts;
                            await saveShiftsManually(updatedShifts);
                          }}
                          class="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold px-2 py-1.5 rounded-lg text-slate-700 font-mono"
                        >
                          ⏱️ {s.start_time}
                        </button>

                        <button
                          on:click={() =>
                            handleRemoveStaff(
                              selectedEditDate,
                              s.member_id,
                              s.role,
                            )}
                          class="text-red-500 hover:bg-red-50 p-1.5 rounded-lg"
                          aria-label="削除"
                        >
                          <Trash2 class="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>

              <!-- 新規追加 -->
              <div class="pt-3 border-t border-slate-100">
                <label
                  for="member-select"
                  class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5"
                  >スタッフの追加</label
                >
                <select
                  id="member-select"
                  on:change={(e) => {
                    const target = /** @type {HTMLSelectElement} */ (e.target);
                    if (target && target.value) {
                      handleAddStaff(selectedEditDate, target.value);
                      target.value = "";
                    }
                  }}
                  class="w-full bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:border-[#0071e3]"
                >
                  <option value="">＋ メンバーの選択</option>
                  {#each members as m}
                    {#each m.roles || [m.role] as r}
                      <option value="{m.id}:{r}"
                        >{m.emoji}
                        {m.name} — {r === "kitchen"
                          ? "🍳 キッチン"
                          : "🛎 ホール"}{m.roles?.length > 1
                          ? " ✦"
                          : ""}</option
                      >
                    {/each}
                  {/each}
                </select>
              </div>
            </div>
          {:else}
            <p class="text-center py-5 text-xs font-bold text-slate-400">
              休業日のため配置不可です。
            </p>
          {/if}
        {:else}
          <!-- 一般スタッフ向け閲覧ビュー -->
          {#if isHoliday || isRegularClosed}
            <p class="text-center py-8 text-sm font-bold text-slate-400">
              本日（{monthNum}月{dayNum}日）は {isRegularClosed
                ? "定休日"
                : "臨時休業日"} です。
            </p>
          {:else}
            <div class="space-y-4">
              <p
                class="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
              >
                出勤スタッフ
              </p>

              <div class="space-y-2 max-h-[300px] overflow-y-auto">
                {#if dateShifts.length === 0}
                  <p
                    class="text-xs text-slate-500 py-8 text-center font-medium"
                  >
                    出勤メンバーはいません。
                  </p>
                {:else}
                  {#each dateShifts as s}
                    {@const m = members.find((mem) => mem.id === s.member_id)}
                    {@const isTrainee = m?.status === "trainee"}
                    <div
                      class="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-100"
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-black text-slate-800">
                          {m?.emoji || "🧑‍🍳"}
                          {s.member_name}
                        </span>
                        {#if isTrainee}
                          <span
                            class="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold"
                            >🔰 研修中</span
                          >
                        {/if}
                      </div>

                      <div class="flex items-center gap-3">
                        <span class="text-xs font-semibold text-slate-500">
                          {s.role === "kitchen" ? "🍳 キッチン" : "🛎️ ホール"}
                        </span>
                        <span
                          class="bg-[#0071e3]/10 text-[#0071e3] text-xs font-extrabold px-2.5 py-1 rounded-lg"
                        >
                          ⏱️ {s.start_time}〜
                        </span>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        {/if}

        <button
          on:click={() => (selectedEditDate = null)}
          class="w-full btn-apple btn-primary py-3.5 text-xs mt-6"
        >
          閉じる
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Apple風極上シンプルポップアップ・モーダルオーバーレイ */
  .apple-modal-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background-color: rgba(15, 23, 42, 0.6) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    z-index: 9999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 1.5rem !important;
  }

  .apple-setup-container {
    min-height: 70vh;
    background-color: #000000 !important;
    color: #ffffff !important;
    border-radius: 24px;
    padding: 3.5rem 2rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .apple-setup-glow {
    position: absolute;
    top: -150px;
    left: 50%;
    transform: translateX(-50%);
    width: 320px;
    height: 320px;
    background: radial-gradient(
      circle,
      rgba(0, 113, 227, 0.2) 0%,
      rgba(0, 0, 0, 0) 70%
    );
    border-radius: 50%;
    pointer-events: none;
  }

  .apple-setup-content {
    width: 100%;
    max-width: 360px;
    z-index: 2;
  }

  .apple-setup-logo {
    font-size: 26px;
    width: 48px;
    height: 48px;
    background-color: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem auto;
    color: #ffffff;
    user-select: none;
  }

  .apple-setup-title {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
    text-align: center;
    margin-bottom: 0.5rem;
    color: #ffffff !important;
  }

  .apple-setup-subtitle {
    font-size: 13px;
    color: #86868b !important;
    text-align: center;
    line-height: 1.5;
    margin-bottom: 2.5rem;
  }

  .apple-form-group {
    margin-bottom: 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .apple-form-label {
    font-size: 10px;
    font-weight: 600;
    color: #86868b !important;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: left;
  }

  .apple-input-text {
    width: 100% !important;
    box-sizing: border-box !important;
    background-color: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 14px !important;
    padding: 14px 18px !important;
    color: #ffffff !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    transition: all 0.25s ease !important;
  }

  .apple-input-text:focus {
    border-color: #ffffff !important;
    background-color: rgba(255, 255, 255, 0.1) !important;
    outline: none !important;
    box-shadow: 0 0 0 1px #ffffff !important;
  }

  .apple-input-text::placeholder {
    color: #48484a !important;
  }

  .apple-segmented-roles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .apple-role-btn {
    background-color: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 14px !important;
    padding: 14px !important;
    color: #aeaeb2 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) !important;
  }

  .apple-role-btn:hover {
    border-color: rgba(255, 255, 255, 0.2) !important;
    color: #ffffff !important;
    background-color: rgba(255, 255, 255, 0.06) !important;
  }

  .apple-role-btn.active {
    background-color: #ffffff !important;
    border-color: #ffffff !important;
    color: #000000 !important;
    font-weight: 700 !important;
    box-shadow: 0 8px 24px rgba(255, 255, 255, 0.12) !important;
  }

  .apple-segmented-status {
    display: flex;
    background-color: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 14px !important;
    padding: 3px !important;
  }

  .apple-status-btn {
    flex: 1 !important;
    background: transparent !important;
    border: none !important;
    border-radius: 11px !important;
    padding: 10px 0 !important;
    color: #8e8e93 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) !important;
  }

  .apple-status-btn:hover {
    color: #ffffff !important;
  }

  .apple-status-btn.active {
    background-color: #ffffff !important;
    color: #000000 !important;
    font-weight: 700 !important;
    box-shadow: 0 4px 10px rgba(255, 255, 255, 0.08) !important;
  }

  .apple-btn-submit {
    width: 100% !important;
    background-color: #ffffff !important;
    border: none !important;
    border-radius: 14px !important;
    padding: 16px !important;
    color: #000000 !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    margin-top: 2rem !important;
  }

  .apple-btn-submit:hover {
    background-color: #f5f5f7 !important;
  }

  .apple-btn-submit:active {
    transform: scale(0.985) !important;
  }

  .apple-btn-submit:disabled {
    background-color: #1c1c1e !important;
    color: #48484a !important;
    cursor: not-allowed !important;
  }

  .apple-btn-cancel {
    width: 100% !important;
    background: transparent !important;
    border: none !important;
    color: #86868b !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    text-align: center !important;
    cursor: pointer !important;
    margin-top: 1rem !important;
    transition: color 0.2s ease !important;
  }

  .apple-btn-cancel:hover {
    color: #ffffff !important;
    text-decoration: underline !important;
  }

  .apple-loading-spinner {
    width: 16px;
    height: 16px;
    border: 2.5px solid rgba(0, 0, 0, 0.15);
    border-top: 2.5px solid #000000;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
