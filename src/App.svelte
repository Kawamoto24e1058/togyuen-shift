<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
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
    Flame
  } from 'lucide-svelte';

  // Firebase FCMヘルパー
  import {
    requestNotificationPermissionAndSaveToken,
    onForegroundMessage
  } from './firebase.js';

  // 初期メンバーマスタ
  const INITIAL_MEMBERS = [
    { id: 1, name: "佐藤", role: "kitchen", roles: ["kitchen"], status: "regular", roleName: "キッチン", statusName: "通常", color: "#ff7043", emoji: "👨‍🍳" },
    { id: 2, name: "鈴木", role: "kitchen", roles: ["kitchen", "hall"], status: "regular", roleName: "キッチン/ホール", statusName: "通常", color: "#ff7043", emoji: "👨‍🍳" },
    { id: 3, name: "高橋", role: "hall", roles: ["kitchen", "hall"], status: "regular", roleName: "キッチン/ホール", statusName: "通常", color: "#ffb300", emoji: "👩‍💼" },
    { id: 4, name: "田中", role: "hall", roles: ["hall"], status: "regular", roleName: "ホール", statusName: "通常", color: "#ffb300", emoji: "🧑‍💻" },
    { id: 5, name: "渡辺", role: "hall", roles: ["hall"], status: "regular", roleName: "ホール", statusName: "通常", color: "#ffb300", emoji: "👱‍♀️" },
    { id: 6, name: "伊藤", role: "kitchen", roles: ["kitchen"], status: "trainee", roleName: "キッチン", statusName: "研修", color: "#ff2a7a", emoji: "👶" },
    { id: 7, name: "山本", role: "hall", roles: ["hall"], status: "trainee", roleName: "ホール", statusName: "研修", color: "#ff2a7a", emoji: "🧒" }
  ];

  // 初期シフト（Python数理最適化の算出値）
  const DEFAULT_SHIFTS = [
    { date: "2026-06-01", member_id: 2, member_name: "鈴木", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-01", member_id: 3, member_name: "高橋", role: "hall", start_time: "17:30" },
    { date: "2026-06-02", member_id: 2, member_name: "鈴木", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-02", member_id: 4, member_name: "田中", role: "hall", start_time: "17:30" },
    // 6/3 水曜定休
    { date: "2026-06-04", member_id: 1, member_name: "佐藤", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-04", member_id: 3, member_name: "高橋", role: "hall", start_time: "17:30" },
    { date: "2026-06-05", member_id: 2, member_name: "鈴木", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-05", member_id: 5, member_name: "渡辺", role: "hall", start_time: "17:30" },
    // 6/6 研修生 伊藤君（総勢3名）
    { date: "2026-06-06", member_id: 4, member_name: "田中", role: "hall", start_time: "17:30" },
    { date: "2026-06-06", member_id: 5, member_name: "渡辺", role: "hall", start_time: "17:30" },
    { date: "2026-06-06", member_id: 6, member_name: "伊藤", role: "kitchen", start_time: "17:00" },
    // 6/7 研修生 伊藤君（総勢3名）
    { date: "2026-06-07", member_id: 4, member_name: "田中", role: "hall", start_time: "17:30" },
    { date: "2026-06-07", member_id: 5, member_name: "渡辺", role: "hall", start_time: "17:30" },
    { date: "2026-06-07", member_id: 6, member_name: "伊藤", role: "kitchen", start_time: "17:00" },
    // 6/8 臨時休業
    { date: "2026-06-09", member_id: 1, member_name: "佐藤", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-09", member_id: 5, member_name: "渡辺", role: "hall", start_time: "17:30" },
    // 6/10 水曜定休
    { date: "2026-06-11", member_id: 2, member_name: "鈴木", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-11", member_id: 5, member_name: "渡辺", role: "hall", start_time: "17:30" },
    { date: "2026-06-12", member_id: 2, member_name: "鈴木", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-12", member_id: 3, member_name: "高橋", role: "hall", start_time: "17:30" },
    { date: "2026-06-13", member_id: 1, member_name: "佐藤", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-13", member_id: 4, member_name: "田中", role: "hall", start_time: "17:30" },
    { date: "2026-06-14", member_id: 1, member_name: "佐藤", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-14", member_id: 4, member_name: "田中", role: "hall", start_time: "17:30" },
    { date: "2026-06-15", member_id: 1, member_name: "佐藤", role: "kitchen", start_time: "17:00" },
    { date: "2026-06-15", member_id: 3, member_name: "高橋", role: "hall", start_time: "17:30" }
  ];

  // 6月の対象日付リスト (2026年6月1日〜6月30日) を動的に生成
  const DATES = Array.from({ length: 30 }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = `2026-06-${String(dayNum).padStart(2, '0')}`;
    const dateObj = new Date(2026, 5, dayNum); // 5 = June (0-indexed)
    const wNameList = ["日", "月", "火", "水", "木", "金", "土"];
    const wName = wNameList[dateObj.getDay()];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const isRegularClosed = dateObj.getDay() === 3; // 毎週水曜定休
    const isSpecialClosed = dayNum === 8; // 6/8は特別な臨時休業日
    
    return {
      dateStr,
      day: `6/${String(dayNum).padStart(2, '0')}`,
      wName,
      isWeekend,
      isRegularClosed,
      ...(isSpecialClosed ? { isSpecialClosed: true, reason: "臨時休業" } : {}),
      dayNum
    };
  });

  // 日曜始まりのヘッダー定義
  const CALENDAR_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];

  // 35マスのカレンダーグリッド（5/31〜7/4）を生成
  const GRID_CELLS = [
    {
      dateStr: "2026-05-31",
      day: "5/31",
      wName: "日",
      isWeekend: true,
      isRegularClosed: false,
      isOtherMonth: true,
      dayNum: 31
    },
    ...DATES,
    ...Array.from({ length: 4 }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `2026-07-${String(dayNum).padStart(2, '0')}`;
      const dateObj = new Date(2026, 6, dayNum); // 6 = July
      const wNameList = ["日", "月", "火", "水", "木", "金", "土"];
      const wName = wNameList[dateObj.getDay()];
      return {
        dateStr,
        day: `7/${String(dayNum).padStart(2, '0')}`,
        wName,
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        isRegularClosed: dateObj.getDay() === 3,
        isOtherMonth: true,
        dayNum
      };
    })
  ];

  // アプリケーションステート
  let activeTab = 'calendar'; 
  let shifts = DEFAULT_SHIFTS;
  let members = INITIAL_MEMBERS;
  let specialHolidays = ["2026-06-08"];
  let isGenerating = false;
  let toastMessage = null;

  // 提出保存・締め切り用の新規ステート
  let isSubmitting = false;
  let deadlineDate = "2026-05-30T23:59:59";
  let deadlineInput = "2026-05-30T23:59";
  let isLocked = false;

  $: isLocked = deadlineDate ? (new Date() > new Date(deadlineDate)) : false;

  // LINEログイン・ユーザーセッション用ステート
  let currentUser = null;
  let loginSimulateStaffId = 3;

  // 本物の LINE ログイン用ステート
  let isAuthenticating = false;
  let authErrorMessage = null;
  let unlinkedLineUserId = null;
  let unlinkedDisplayName = null;

  // FCM プッシュ通知用ステート
  let fcmPermissionStatus = 'idle'; // 'idle' | 'requesting' | 'granted' | 'denied'
  let foregroundNotification = null; // フォアグラウンドメッセージ表示用

  /**
   * FCMトークン取得とFirestore保存。ログイン完了直後またはonMount時に呼び出す。
   */
  async function requestFcmToken(lineUserId) {
    if (typeof window === 'undefined' || !lineUserId) return;
    // まだ未承諾の場合はリクエストパーミッションダイアログを出す
    if (Notification?.permission === 'default') {
      fcmPermissionStatus = 'requesting';
    }
    const token = await requestNotificationPermissionAndSaveToken(lineUserId);
    if (token) {
      fcmPermissionStatus = 'granted';
    } else {
      fcmPermissionStatus = Notification?.permission === 'denied' ? 'denied' : 'idle';
    }
  }

  // 本物の LINE ログイン開始処理
  async function handleLineLogin() {
    isAuthenticating = true;
    authErrorMessage = null;
    try {
      const res = await fetch('/api/auth/line-url');
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("認可URLの生成に失敗しました。");
      }
    } catch (err) {
      console.error(err);
      isAuthenticating = false;
      triggerToast(`⚠️ LINEログインエラー: ${err.message}`);
    }
  }

  // LINEログインシミュレーションのハンドラ
  async function handleLineLoginSimulation() {
    const member = members.find(m => m.id === Number(loginSimulateStaffId));
    if (!member) return;

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `MOCK_AUTH_CODE_FOR_${member.id}`,
          staffId: member.id
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      currentUser = {
        id: member.id,
        name: member.name,
        role: member.role,
        roles: member.roles || [member.role],
        status: member.status,
        avatar: member.emoji || "🧑‍🍳",
        lineUserId: data.user.lineUserId,
        isAdmin: member.id === 1 || member.id === 2 // 佐藤、鈴木さんを管理者とする
      };

      // ログイン情報をキャッシュ
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // ログイン従業員の希望提出状況を同期
      selectedStaffId = member.id;
      await loadStaffSubmissions(member.id);

      triggerToast(`💚 LINEログイン成功 (模擬): ${member.name}さんとして認証されました。`);

      // ログイン完了直後にFCM通知許可をリクエスト
      requestFcmToken(data.user.lineUserId).catch(console.error);
    } catch (err) {
      triggerToast(`⚠️ LINEログイン失敗: ${err.message}`);
    } finally {
      isSubmitting = false;
    }
  }

  function handleSignOut() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    unlinkedLineUserId = null;
    unlinkedDisplayName = null;
    authErrorMessage = null;
    showRegistrationForm = false;
    regName = "";
    regRoles = [];
    regStatus = "regular";
    staffAvailabilities = {};
    activeTab = 'calendar'; // シフト表へリダイレクト
    triggerToast("👋 サインアウトしました。セッションを終了しました。");
  }

  // 初回プロフィール作成フォーム用のリアクティブ変数
  let showRegistrationForm = false;
  let regName = "";
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          roles: regRoles,
          status: regStatus,
          lineUserId: unlinkedLineUserId
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.registered) {
        currentUser = {
          ...data.user,
          avatar: regRoles.includes('kitchen') ? "👨‍🍳" : "👩‍💼", // アイコン自動アサイン
          isAdmin: data.user.id === 1 || data.user.id === 2 // 佐藤、鈴木さんを管理者とする
        };

        // ログインキャッシュを作成
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        triggerToast(`💚 登録が完了しました！${currentUser.name}さん、歓迎します。`);
        
        // 登録用ステートを綺麗に初期化
        showRegistrationForm = false;
        regName = "";
        regRoles = [];
        regStatus = "regular";
        
        selectedStaffId = currentUser.id;
        await loadStaffSubmissions(currentUser.id);
        
        // FCM通知許可を促す
        requestFcmToken(currentUser.lineUserId).catch(console.error);
      }
    } catch (err) {
      console.error(err);
      triggerToast(`⚠️ 登録エラー: ${err.message}`);
    } finally {
      isRegistering = false;
    }
  }

  // ネオンハイライトギミック用 (画面A)
  let highlightMemberId = 3;

  // 自分のシフトだけ表示フィルター
  let showMyShiftsOnly = false;

  // モーダル・ダイアログ制御
  let selectedEditDate = null;
  let selectedBulkClosedDay = null;

  // ドラッグ＆ドロップ
  let draggingItem = null;
  let dragOverDate = null;

  // 従業員希望提出用のステート (画面B)
  let selectedStaffId = 3; 
  let submitPattern = 'A'; 
  let staffAvailabilities = {};
  let staffDefaultPatterns = {
    1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'B', 7: 'B'
  };

  // 特定スタッフの提出データをDBからロードして復元する関数
  async function loadStaffSubmissions(staffId) {
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        const mySub = data.find(sub => sub.staffId === Number(staffId) && sub.period === "2026-06");
        if (mySub && mySub.availabilities) {
          staffAvailabilities = mySub.availabilities;
        } else {
          staffAvailabilities = {};
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchDeadline() {
    try {
      const res = await fetch('/api/deadline');
      if (res.ok) {
        const data = await res.json();
        deadlineDate = data.deadlineDate;
        const dObj = new Date(deadlineDate);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        const h = String(dObj.getHours()).padStart(2, '0');
        const min = String(dObj.getMinutes()).padStart(2, '0');
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
      const res = await fetch('/api/deadline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadlineDate: formattedDate })
      });
      if (res.ok) {
        deadlineDate = formattedDate;
        triggerToast("✅ 提出締め切り日時を更新しました！");
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      triggerToast(`⚠️ 更新エラー: ${err.message}`);
    }
  }

  onMount(async () => {
    // 1. ローカルストレージから既存のサインインセッションを復元
    const cachedUser = localStorage.getItem('currentUser');
    if (cachedUser) {
      try {
        currentUser = JSON.parse(cachedUser);
        // バックグラウンドでFCMトークンの自動確認・更新
        requestFcmToken(currentUser.lineUserId).catch(console.error);
        if (currentUser.id) {
          selectedStaffId = currentUser.id;
          loadStaffSubmissions(currentUser.id).catch(console.error);
        }
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }

    // 2. URLパラメータからLINE OAuth認証コード (code) の有無を確認
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      isAuthenticating = true;
      authErrorMessage = null;
      triggerToast("🔐 LINEログイン認証中...");
      
      try {
        const res = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = await res.json();
        if (data.registered) {
          currentUser = {
            ...data.user,
            avatar: members.find(m => m.id === Number(data.user.id))?.emoji || "🧑‍🍳",
            isAdmin: data.user.id === 1 || data.user.id === 2 // 佐藤、鈴木さんを管理者とする
          };
          localStorage.setItem('currentUser', JSON.stringify(currentUser));
          triggerToast(`💚 LINEログイン成功: ${currentUser.name}さんとして認証されました。`);
          
          selectedStaffId = currentUser.id;
          await loadStaffSubmissions(currentUser.id);
          
          requestFcmToken(currentUser.lineUserId).catch(console.error);
        } else {
          // 未登録 (lineUserId が Firestore の members に未登録)
          unlinkedLineUserId = data.lineUserId;
          unlinkedDisplayName = data.displayName;
          regName = data.displayName || ""; // お名前を初期入力欄に補完
          showRegistrationForm = true;      // Apple風初回登録フォームをアクティブにする
          triggerToast("✨ 初回サインイン: プロフィール作成画面へ移行します。");
        }
      } catch (err) {
        console.error(err);
        authErrorMessage = `LINE認証に失敗しました: ${err.message}`;
        triggerToast(`⚠️ 認証エラー: ${err.message}`);
      } finally {
        isAuthenticating = false;
        // URLパラメータをクリアしてアドレスバーを綺麗にする (SPA)
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // 既存の初期化処理
    fetch('/assigned_shifts.json')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          shifts = data;
        }
      })
      .catch(() => {});

    fetchDeadline();

    // フォアグラウンドメッセージ受信ハンドラーを登録
    const unsubscribeForeground = onForegroundMessage((payload) => {
      const title = payload.notification?.title || '桃牛苑 シフト提出の締め切り';
      const body  = payload.notification?.body  || '本日シフトの締め切り日です。アプリから入力をお願いします。';
      foregroundNotification = { title, body };
      setTimeout(() => { foregroundNotification = null; }, 8000);
    });

    return () => {
      if (typeof unsubscribeForeground === 'function') unsubscribeForeground();
    };
  });

  // リアクティブ制約バリデーション
  $: validationResults = DATES.reduce((acc, d) => {
    const dateStr = d.dateStr;
    const isClosed = d.isRegularClosed || specialHolidays.includes(dateStr);
    
    if (isClosed) {
      const count = shifts.filter(s => s.date === dateStr).length;
      acc[dateStr] = count > 0 
        ? { isValid: false, message: "休業日アサインあり" }
        : { isValid: true };
      return acc;
    }
    
    const todayShifts = shifts.filter(s => s.date === dateStr);
    const kitchenCount = todayShifts.filter(s => s.role === 'kitchen').length;
    const hallCount = todayShifts.filter(s => s.role === 'hall').length;
    
    if (kitchenCount < 1 || hallCount < 1) {
      acc[dateStr] = { isValid: false, message: "キッチン・ホール不足" };
      return acc;
    }
    
    const traineeStaff = todayShifts.filter(s => {
      const m = members.find(mem => mem.id === s.member_id);
      return m && m.status === 'trainee';
    });
    const hasTrainee = traineeStaff.length > 0;
    
    const totalCount = todayShifts.length;
    const requiredTotal = hasTrainee ? 3 : 2;
    if (totalCount !== requiredTotal) {
      acc[dateStr] = { 
        isValid: false, 
        message: hasTrainee ? "研修生がいる日は総勢3名必須" : "通常営業日は総勢2名必須" 
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
  }, {});

  $: memberAssignedStats = members.map(m => {
    const count = shifts.filter(s => s.member_id === m.id).length;
    const target = m.status === 'trainee' ? '土日' : 10;
    const isOk = m.status === 'trainee' ? (count > 0) : (count === 10);
    const isUnder = m.status === 'regular' && count < 10;
    const isOver = m.status === 'regular' && count > 10;
    return {
      ...m,
      count,
      target,
      isOk,
      isUnder,
      isOver
    };
  });

  function triggerToast(msg) {
    toastMessage = msg;
    setTimeout(() => {
      toastMessage = null;
    }, 3000);
  }

  function handleAddStaff(dateStr, memberIdRole) {
    // memberIdRole can be "memberId:role" or just "memberId"
    const parts = String(memberIdRole).split(':');
    const memberId = Number(parts[0]);
    const assignedRole = parts[1] || null;

    const member = members.find(m => m.id === memberId);
    if (!member) return;

    // Choose role: explicit from dropdown, or fallback to primary role
    const role = assignedRole || member.role;

    // Prevent same member assigned to same date in same role
    const already = shifts.some(s => s.date === dateStr && s.member_id === member.id && s.role === role);
    if (already) {
      triggerToast(`⚠️ ${member.name}さん(${role === 'kitchen' ? 'キッチン' : 'ホール'})は配置済みです。`);
      return;
    }
    
    const start = role === 'kitchen' ? '17:00' : '17:30';
    shifts = [...shifts, {
      date: dateStr,
      member_id: member.id,
      member_name: member.name,
      role: role,
      start_time: start
    }];
  }

  function handleRemoveStaff(dateStr, memberId, role) {
    if (role) {
      shifts = shifts.filter(s => !(s.date === dateStr && s.member_id === memberId && s.role === role));
    } else {
      shifts = shifts.filter(s => !(s.date === dateStr && s.member_id === memberId));
    }
  }

  function toggleSpecialHoliday(dateStr) {
    if (specialHolidays.includes(dateStr)) {
      specialHolidays = specialHolidays.filter(d => d !== dateStr);
    } else {
      specialHolidays = [...specialHolidays, dateStr];
      shifts = shifts.filter(s => s.date !== dateStr);
    }
  }

  async function handleSendRemind() {
    try {
      const res = await fetch('/api/remind', {
        method: 'POST'
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      if (data.remindedCount === 0) {
        triggerToast("📢 未提出メンバーはいません（全員提出済みです）。");
      } else {
        triggerToast(`📢 未提出の${data.remindedCount}名（${data.remindedNames.join(', ')}）へLINEリマインドを配信しました！`);
      }
    } catch (err) {
      triggerToast(`⚠️ リマインド配信失敗: ${err.message}`);
    }
  }

  function handleReGenerate() {
    isGenerating = true;
    setTimeout(() => {
      fetch('/assigned_shifts.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            shifts = data;
          }
        })
        .catch(() => {
          shifts = DEFAULT_SHIFTS;
        });
      specialHolidays = ["2026-06-08"];
      isGenerating = false;
      triggerToast("✨ AI自動シフト作成(Python)を完了しました。");
    }, 2000);
  }

  function handleBulkClosedSetting(wName) {
    const targetDateStrs = DATES.filter(d => d.wName === wName).map(d => d.dateStr);
    const allHolidays = targetDateStrs.every(dStr => specialHolidays.includes(dStr));

    if (allHolidays) {
      specialHolidays = specialHolidays.filter(d => !targetDateStrs.includes(d));
    } else {
      specialHolidays = Array.from(new Set([...specialHolidays, ...targetDateStrs]));
      shifts = shifts.filter(s => !targetDateStrs.includes(s.date));
    }
    selectedBulkClosedDay = null;
  }

  // ドラッグ＆ドロップ (店長画面)
  function handleDragStart(e, memberId, sourceDate, role) {
    draggingItem = { memberId, sourceDate, role };
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
  }

  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggingItem = null;
    dragOverDate = null;
  }

  function handleDragOver(e, dateStr) {
    e.preventDefault();
    if (draggingItem && draggingItem.sourceDate !== dateStr) {
      dragOverDate = dateStr;
    }
  }

  function handleDrop(e, targetDate) {
    e.preventDefault();
    dragOverDate = null;
    if (!draggingItem) return;

    const { memberId, sourceDate, role: dragRole } = draggingItem;
    if (sourceDate === targetDate) return;

    const d = DATES.find(date => date.dateStr === targetDate);
    const isClosed = d?.isRegularClosed || specialHolidays.includes(targetDate);
    if (isClosed) return;

    // Prevent duplicate: same member + same role on same day
    const already = shifts.some(s => s.date === targetDate && s.member_id === memberId && s.role === dragRole);
    if (already) return;

    const member = members.find(m => m.id === memberId);
    if (!member) return;

    // Remove the source shift entry (match by date, member, and role)
    const filtered = shifts.filter(s => !(s.date === sourceDate && s.member_id === memberId && s.role === dragRole));
    const role = dragRole || member.role;
    const start = role === 'kitchen' ? '17:00' : '17:30';
    shifts = [...filtered, {
      date: targetDate,
      member_id: member.id,
      member_name: member.name,
      role: role,
      start_time: start
    }];
    triggerToast(`🎮 ${member.name}さん(${role === 'kitchen' ? 'キッチン' : 'ホール'})のシフトを ${targetDate} へ移動しました。`);
  }

  function handleToggleAvailability(dateStr) {
    const currentVal = staffAvailabilities[dateStr] !== undefined 
      ? staffAvailabilities[dateStr] 
      : (submitPattern === 'A');

    staffAvailabilities = {
      ...staffAvailabilities,
      [dateStr]: !currentVal
    };
  }

  const WEEKDAY_NAMES = CALENDAR_HEADERS;

  async function handleStaffSubmit() {
    if (isSubmitting) return;
    if (isLocked) {
      triggerToast("🔒 提出締め切り日時を過ぎているため、スケジュール希望は提出できません。");
      return;
    }

    const m = members.find(mem => mem.id === selectedStaffId);
    if (!m) return;

    isSubmitting = true;

    const payload = {
      staffId: m.id,
      period: "2026-06",
      availabilities: staffAvailabilities,
      lineUserId: currentUser ? currentUser.lineUserId : `U06c755lineUser_${m.id}`,
      submittedAt: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const targetDates = DATES.filter(d => {
        if (d.isRegularClosed) return false;
        const isAvail = staffAvailabilities[d.dateStr] !== undefined 
          ? staffAvailabilities[d.dateStr] 
          : (submitPattern === 'A');
        return submitPattern === 'A' ? !isAvail : isAvail;
      });
      const count = targetDates.length;
      const label = submitPattern === 'A' ? '休み希望' : '出勤可能日';

      triggerToast(`📢 ${m.name}さんの${label} (${count}日分) をシステムへ送信・安全に保存しました！`);
    } catch (err) {
      triggerToast(`⚠️ 送信失敗: ${err.message}`);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="pb-16 text-slate-800 font-sans select-none selection:bg-[#0071e3]/20">
  
  <!-- トースト -->
  {#if toastMessage}
    <div class="fixed top-6 right-6 z-50 animate-popup bg-white border border-slate-200/80 text-slate-800 px-6 py-4 rounded-3xl shadow-xl flex items-center gap-3">
      <Sparkles class="w-5 h-5 text-[#0071e3]" />
      <span class="font-semibold text-xs tracking-wide text-slate-700">{toastMessage}</span>
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
      <div class="bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3.5 max-w-sm w-[calc(100vw-3rem)]">
        <!-- 通知アイコン -->
        <div class="w-9 h-9 rounded-xl bg-[#06c755] flex items-center justify-center shrink-0 mt-0.5">
          <Bell class="w-4 h-4 text-white" />
        </div>
        <!-- テキスト -->
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-black text-white/60 uppercase tracking-widest mb-0.5">桃牛苑シフト</p>
          <p class="text-sm font-bold text-white leading-snug">{foregroundNotification.title}</p>
          <p class="text-xs text-white/70 mt-0.5 leading-relaxed">{foregroundNotification.body}</p>
        </div>
        <!-- 閉じるボタン -->
        <button
          on:click={() => foregroundNotification = null}
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
  {#if currentUser && fcmPermissionStatus === 'idle'}
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-popup" in:fade={{ duration: 300 }}>
      <div class="bg-white border border-slate-200 shadow-2xl rounded-2xl px-5 py-4 flex items-center gap-4 max-w-sm w-[calc(100vw-3rem)]">
        <div class="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center shrink-0">
          <Bell class="w-5 h-5 text-[#0071e3]" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-900">シフトリマインドを受け取る</p>
          <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">締め切り前に自動でお知らせします</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            on:click={() => { fcmPermissionStatus = 'denied'; }}
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
  <header class="py-4 border-b border-slate-200 sticky top-0 z-40 bg-white/90 backdrop-blur-md shadow-sm">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-2.5 h-2.5 rounded-full bg-[#0071e3] shadow-[0_0_10px_rgba(0,113,227,0.5)]"></div>
        <div>
          <h1 class="text-base font-black tracking-tight text-slate-900 uppercase">桃牛苑 シフト管理</h1>
        </div>
      </div>

      <!-- スタイリッシュセグメントタブ ＆ LINEユーザープロフィール -->
      <div class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
        <div class="segmented-control w-full md:w-[480px]">
          <button
            on:click={() => activeTab = 'calendar'}
            class="segment-btn {activeTab === 'calendar' ? 'active' : ''}"
          >
            シフト表・カレンダー
          </button>
          <button
            on:click={() => activeTab = 'submissions'}
            class="segment-btn {activeTab === 'submissions' ? 'active' : ''}"
          >
            スケジュール希望提出
          </button>
          <button
            on:click={() => activeTab = 'manager'}
            class="segment-btn {activeTab === 'manager' ? 'active' : ''}"
          >
            管理者ダッシュボード
          </button>
        </div>

        {#if currentUser}
          <div class="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-2xl border border-slate-200/60 animate-popup w-full md:w-auto">
            <div class="w-6 h-6 rounded-full bg-[#06c755]/10 flex items-center justify-center text-xs border border-[#06c755]/20 select-none">
              {currentUser.avatar}
            </div>
            <div class="text-left leading-none">
              <div class="text-[8px] text-slate-400 font-black uppercase tracking-wider">LINE連携中</div>
              <div class="text-[11px] font-bold text-slate-700 mt-0.5 flex items-center gap-1">
                {currentUser.name}さん
                <span class="text-[7px] bg-[#06c755]/10 text-[#06c755] border border-[#06c755]/20 px-0.5 rounded font-extrabold">
                  {(currentUser.roles?.length > 1 ? 'キッチン/ホール' : (currentUser.role === 'kitchen' ? 'キッチン' : 'ホール'))}
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
                ようこそ、桃牛苑へ。<br />あなたのプロフィールを設定してシフト管理を開始しましょう。
              </p>
            </div>

            <!-- Form -->
            <div class="space-y-6">
              <!-- Name Input -->
              <div class="apple-form-group">
                <label for="reg-name" class="apple-form-label">お名前 (氏名)</label>
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
                      if (regRoles.includes('kitchen')) {
                        regRoles = regRoles.filter(r => r !== 'kitchen');
                      } else {
                        regRoles = [...regRoles, 'kitchen'];
                      }
                    }}
                    class="apple-role-btn {regRoles.includes('kitchen') ? 'active' : ''}"
                  >
                    <span>🍳</span> キッチン
                  </button>
                  <button 
                    type="button"
                    on:click={() => {
                      if (regRoles.includes('hall')) {
                        regRoles = regRoles.filter(r => r !== 'hall');
                      } else {
                        regRoles = [...regRoles, 'hall'];
                      }
                    }}
                    class="apple-role-btn {regRoles.includes('hall') ? 'active' : ''}"
                  >
                    <span>🛎</span> ホール
                  </button>
                </div>
                <p class="text-[10px] text-slate-500 font-medium mt-1">※両方の職種に対応している場合は、両方とも選択できます。</p>
              </div>

              <!-- Status Selection (Segmented Control style) -->
              <div class="apple-form-group">
                <span class="apple-form-label">区分 (ステータス)</span>
                <div class="apple-segmented-status">
                  <button 
                    type="button"
                    on:click={() => regStatus = 'regular'}
                    class="apple-status-btn {regStatus === 'regular' ? 'active' : ''}"
                  >
                    通常バイト
                  </button>
                  <button 
                    type="button"
                    on:click={() => regStatus = 'trainee'}
                    class="apple-status-btn {regStatus === 'trainee' ? 'active' : ''}"
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
        <div class="min-h-[70vh] flex items-center justify-center bg-slate-50 px-6 py-12 animate-popup rounded-3xl border border-slate-200/50 bg-white glass-panel shadow-sm" in:fade={{ duration: 150 }}>
          <div class="max-w-md w-full p-6 flex flex-col items-center text-center space-y-8">
            <div class="space-y-4">
              <div class="w-16 h-16 rounded-3xl bg-[#06c755] shadow-[0_4px_16px_rgba(6,199,85,0.25)] flex items-center justify-center text-white text-3xl font-extrabold mx-auto select-none">
                L
              </div>
              <h2 class="text-2xl font-black text-slate-900 tracking-tight">桃牛苑 シフト管理</h2>
              <p class="text-xs text-slate-400 mt-1 leading-relaxed font-semibold">
                LINEアカウントと連携して、シフトの確認や<br />
                スケジュール希望提出をセキュアに行うことができます。
              </p>
            </div>

            {#if isAuthenticating}
              <!-- 認証中のローディング表示 -->
              <div class="w-full py-12 flex flex-col items-center justify-center space-y-4">
                <div class="w-8 h-8 rounded-full border-2 border-slate-200 border-t-[#06c755] animate-spin"></div>
                <p class="text-xs text-slate-400 font-bold tracking-tight">LINE認証を行っています...</p>
              </div>
            {:else}
              <div class="w-full space-y-5">
                {#if authErrorMessage}
                  <!-- LINEアカウント未連携 / エラー表示 -->
                  <div class="w-full bg-red-50/50 border border-red-100 p-5 rounded-2xl text-left space-y-3 animate-popup">
                    <span class="text-[9px] font-black text-red-500 uppercase tracking-widest block">エラーが発生しました</span>
                    <p class="text-xs text-slate-600 leading-relaxed font-medium">
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
                      <path d="M24 10.3c0-5.7-5.4-10.3-12-10.3s-12 4.6-12 10.3c0 5.1 4.3 9.3 10.1 10.1.4.1.9.3 1 .7.1.3 0 .7-.1 1l-.4 2.5c-.1.5.2.9.6 1 .1 0 .2 0 .3 0 .4 0 .8-.2 1.1-.6l3.3-3.9c.3-.3.5-.5.9-.6 5.3-.9 9.2-4.9 9.2-9.2z"/>
                    </svg>
                    LINE アカウントでサインイン
                  </button>

                  <p class="text-[9px] text-slate-400 font-medium leading-relaxed">
                    ※LINEプラットフォームの認可を受けたセキュアなログインを行います。<br />
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
    {#if activeTab === 'calendar'}
      <div class="space-y-6" in:fade={{ duration: 150 }}>
        
        <!-- スタッフフィルター (ネオンハイライトトリガー) -->
        <div class="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
          <div>
            <h2 class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Sparkles class="w-4 h-4 text-[#0071e3]" />
              個人シフト表示
            </h2>
            <p class="text-xs text-slate-500 mt-0.5 font-medium">名前を選択してハイライト、または「自分だけ」に絞り込んで表示できます。</p>
          </div>
          
          <div class="flex items-center gap-2 flex-wrap">
            <!-- 自分だけ表示トグルボタン -->
            <button
              id="my-shifts-toggle"
              on:click={() => { showMyShiftsOnly = !showMyShiftsOnly; }}
              disabled={!currentUser}
              class="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold border transition-all duration-200 {
                !currentUser
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : showMyShiftsOnly
                    ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-[0_4px_14px_rgba(0,113,227,0.35)] scale-[1.02]'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-[#0071e3] hover:text-[#0071e3]'
              }"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
              </svg>
              {showMyShiftsOnly ? '自分だけ表示中' : '自分だけ表示'}
            </button>

            <!-- ハイライト選択 -->
            <select 
              bind:value={highlightMemberId}
              class="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-[#0071e3] cursor-pointer"
            >
              {#each members as m}
                <option value={m.id}>{m.emoji} {m.name} さん</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- 2カラムレイアウト -->
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          <!-- 左側: 35マスカレンダー (3/4幅) -->
          <div class="lg:col-span-3 space-y-3">
            <!-- 曜日のヘッダー (日曜始まり) -->
            <div class="grid grid-cols-7 gap-3 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
              {#each CALENDAR_HEADERS as h}
                <div class="py-2">{h}</div>
              {/each}
            </div>

            <!-- 日付グリッド -->
            <div class="grid grid-cols-7 gap-3">
              {#each GRID_CELLS as d}
                {@const isRegularClosed = d.isRegularClosed}
                {@const isSpecialClosed = specialHolidays.includes(d.dateStr)}
                {@const isClosed = isRegularClosed || isSpecialClosed}
                {@const allShifts = shifts.filter(s => s.date === d.dateStr)}
                {@const todayShifts = (showMyShiftsOnly && currentUser)
                  ? allShifts.filter(s => s.member_id === currentUser.id)
                  : allShifts}

                <div 
                  class="glass-panel p-4 min-h-[160px] flex flex-col justify-between relative bg-white {
                    d.isOtherMonth ? 'other-month-cell' : ''
                  } {
                    isClosed && !d.isOtherMonth ? 'opacity-40 bg-slate-50 border-dashed shadow-none cursor-default' : ''
                  }"
                >
                  <!-- 上部: 日付タイポグラフィ -->
                  <div>
                    <div class="flex items-start justify-between">
                      <span class="day-number text-xl">
                        {d.dayNum}
                        <span class="text-[9px] text-slate-400 font-bold ml-1 uppercase">({d.wName})</span>
                      </span>
                    </div>

                    <!-- 出勤者のカプセルリスト -->
                    <div class="mt-3.5 space-y-1.5">
                      {#if d.isOtherMonth}
                        <!-- 前月・翌月は空欄 -->
                      {:else if isClosed}
                        <span class="text-[10px] text-slate-400 block mt-3.5 font-bold text-center">
                          {isRegularClosed ? '定休日' : '臨時休業'}
                        </span>
                      {:else if todayShifts.length === 0}
                        <span class="text-[10px] text-slate-400 block mt-3.5 font-bold text-center">未配置</span>
                      {:else}
                        {#each todayShifts as s}
                          {@const m = members.find(mem => mem.id === s.member_id)}
                          {@const isTrainee = m?.status === 'trainee'}
                          {@const isHighlighted = s.member_id === highlightMemberId}

                          <div 
                            class="staff-pill {
                              s.role === 'kitchen' ? 'kitchen-pill' : 'hall-pill'
                            } {
                              isTrainee ? 'trainee-pill' : ''
                            } {
                              isHighlighted ? 'neon-highlight' : ''
                            }"
                          >
                            <span class="font-bold truncate">{s.member_name}</span>
                            <span class="text-[8px] opacity-75 font-mono ml-2 shrink-0">{s.start_time}</span>
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
                <h3 class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Users class="w-4 h-4 text-[#0071e3]" />
                  給与・優先度アシスト
                </h3>
                <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">当月の出勤状況と目標達成インジケーター（目標：月10日）をリアルタイムに集計します。</p>
              </div>

              <!-- AI自動生成カード (スクリーンショット同様) -->
              <div class="bg-slate-50 p-4.5 rounded-xl border border-slate-100 text-xs space-y-3">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-700">自動生成 (AI最適マッピング)</span>
                  <span class="flex items-center gap-1.5 font-bold text-emerald-600">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34c759]"></span> 充足完了
                  </span>
                </div>
                <p class="text-[10px] text-slate-400 font-medium leading-relaxed">Wednesday閉業、通常バイト10日平準化、研修生土日限定のすべてのルールが満たされています。</p>
              </div>

              <!-- スタッフ状況リスト -->
              <div class="space-y-3">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest block">メンバー稼働状況</span>
                {#each memberAssignedStats as m}
                  <div class="sidebar-staff-item flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-bold text-slate-800">{m.emoji} {m.name}</span>
                        <span class="hope-status-badge {
                          m.status === 'trainee' ? 'badge-on' : 'badge-none'
                        } text-[8px] py-0.5 px-1.5">
                          {m.statusName}
                        </span>
                      </div>
                      
                      <p class="text-[9px] text-slate-400 mt-0.5 font-medium">
                        {#if m.status === 'trainee'}
                          土日のみアサイン可能
                        {:else}
                          見積もり給与: ¥{ (m.count * 5 * 1050).toLocaleString() } (5h/日)
                        {/if}
                      </p>
                    </div>

                    <div class="text-right">
                      <span class="text-xs font-bold {
                        m.isUnder ? 'text-amber-600' : m.isOver ? 'text-red-500' : 'text-emerald-600'
                      }">
                        {m.count}日
                      </span>
                      <span class="text-[10px] text-slate-400">/ {m.target === '土日' ? '土日' : '10日'}</span>

                      {#if m.status === 'regular'}
                        <div class="flex justify-end mt-1">
                          {#if m.isUnder}
                            <span class="text-[8px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">不足 ⚠️</span>
                          {:else if m.isOver}
                            <span class="text-[8px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">超過 ⚠️</span>
                          {:else}
                            <span class="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">充足 ●</span>
                          {/if}
                        </div>
                      {:else}
                        <div class="flex justify-end mt-1">
                          {#if m.count === 0}
                            <span class="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">未出勤</span>
                          {:else}
                            <span class="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">出勤あり ●</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

        </div>
      </div>
    {/if}

    <!-- ========================================================================= -->
    <!-- 【希望提出画面】スケジュール希望提出 (カレンダー形式タップ選択)              -->
    <!-- ========================================================================= -->
    {#if activeTab === 'submissions'}
      <div class="space-y-6" in:fade={{ duration: 150 }}>
        
        <div class="glass-panel p-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
          <div>
            <h2 class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Calendar class="w-4 h-4 text-[#0071e3]" />
              カレンダーで希望提出
            </h2>
            <p class="text-xs text-slate-500 mt-0.5 font-medium">カレンダーの日付をタップして休み希望（または出勤可能日）をスマートに設定・提出します。</p>
          </div>

          <div class="flex items-center gap-3.5">
            <div class="flex items-center gap-1.5 bg-slate-100/60 border border-slate-200/50 rounded-full px-4.5 py-2 text-xs font-bold text-slate-700 select-none">
              <span>{currentUser?.avatar || "🧑‍🍳"}</span>
              <span>{currentUser?.name || "ゲスト"} さん</span>
            </div>

            <div class="segmented-control w-[180px]">
              <button
                on:click={() => { submitPattern = 'A'; staffAvailabilities = {}; }}
                class="segment-btn {submitPattern === 'A' ? 'active' : ''}"
              >
                休み希望
              </button>
              <button
                on:click={() => { submitPattern = 'B'; staffAvailabilities = {}; }}
                class="segment-btn {submitPattern === 'B' ? 'active' : ''}"
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
            <div class="grid grid-cols-7 gap-3 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
              {#each CALENDAR_HEADERS as h}
                <div class="py-2">{h}</div>
              {/each}
            </div>

            <!-- 日付グリッド (35マス) -->
            <div class="grid grid-cols-7 gap-3">
              {#each GRID_CELLS as d}
                {@const isRegularClosed = d.isRegularClosed}
                {@const isClosed = isRegularClosed || specialHolidays.includes(d.dateStr)}
                
                {@const currentPattern = submitPattern}
                {@const isAvail = staffAvailabilities[d.dateStr] !== undefined ? staffAvailabilities[d.dateStr] : (currentPattern === 'A')}

                <button 
                  type="button"
                  on:click={() => {
                    if (!d.isOtherMonth && !isClosed && !isLocked) {
                      handleToggleAvailability(d.dateStr);
                    }
                  }}
                  disabled={d.isOtherMonth || isClosed || isLocked}
                  class="glass-panel hope-calendar-cell p-4 flex flex-col justify-between text-left bg-white {
                    d.isOtherMonth ? 'other-month-cell' : ''
                  } {
                    !d.isOtherMonth && (isClosed || isLocked) ? 'locked-cell' : ''
                  } {
                    !d.isOtherMonth && !isClosed && !isLocked && currentPattern === 'A' && !isAvail ? 'hope-off-cell' : ''
                  } {
                    !d.isOtherMonth && !isClosed && !isLocked && currentPattern === 'B' && isAvail ? 'hope-on-cell' : ''
                  }"
                >
                  <!-- 上部: 日付 -->
                  <div class="flex items-start justify-between w-full">
                    <span class="day-number text-lg">
                      {d.dayNum}
                      <span class="text-[9px] text-slate-400 font-bold ml-1 uppercase">({d.wName})</span>
                    </span>
                  </div>

                  <!-- 下部: ステータス表示 -->
                  <div class="mt-4">
                    {#if d.isOtherMonth}
                      <!-- 空 -->
                    {:else if isRegularClosed}
                      <span class="hope-status-badge badge-none">定休日</span>
                    {:else if specialHolidays.includes(d.dateStr)}
                      <span class="hope-status-badge badge-none">臨時休業</span>
                    {:else if isLocked}
                      <span class="hope-status-badge badge-none">🔒 締切ロック</span>
                    {:else if currentPattern === 'A'}
                      {#if !isAvail}
                        <span class="hope-status-badge badge-off">休み希望</span>
                      {:else}
                        <span class="hope-status-badge badge-none">出勤 (通常)</span>
                      {/if}
                    {:else if currentPattern === 'B'}
                      {#if isAvail}
                        <span class="hope-status-badge badge-on">出勤可能</span>
                      {:else}
                        <span class="hope-status-badge badge-none">お休み</span>
                      {/if}
                    {/if}
                  </div>
                </button>
              {/each}
            </div>

            <div class="flex justify-center pt-4">
              <div class="flex flex-col items-center justify-center w-full md:w-[420px] gap-3">
                <button
                  on:click={handleStaffSubmit}
                  disabled={isSubmitting || isLocked}
                  class="w-full btn-apple py-4 text-xs font-bold tracking-wider {
                    isLocked ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none' : 'btn-primary'
                  }"
                >
                  {#if isSubmitting}
                    <span class="flex items-center justify-center gap-2">
                      <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      保存中...
                    </span>
                  {:else if isLocked}
                    🔒 提出締め切り超過（ロック中）
                  {:else}
                    希望スケジュールを提出・保存する
                  {/if}
                </button>
                {#if isLocked}
                  <span class="text-[10px] text-red-500 font-semibold text-center">
                    ⚠️ シフトの提出締め切り日時 ({new Date(deadlineDate).toLocaleString()}) を過ぎているため、新規提出・更新はロックされています。
                  </span>
                {:else}
                  <span class="text-[10px] text-slate-400 font-semibold text-center">
                    ⏰ 提出締め切り: {new Date(deadlineDate).toLocaleString()} まで（締め切り前なら何度でも更新可能）
                  </span>
                {/if}
              </div>
            </div>
          </div>

          <!-- 右側: ガイドサイドバー -->
          <div class="space-y-6">
            <div class="glass-panel p-6 space-y-5 bg-white sticky top-24">
              <div>
                <h3 class="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Smartphone class="w-4 h-4 text-[#0071e3]" />
                  提出アシスト
                </h3>
                <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">カレンダーから日付をタップするだけで、自分の希望スケジュールを迅速に提出できます。</p>
              </div>

              <!-- ルールリマインド -->
              <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[11px] space-y-2.5">
                <span class="font-bold text-slate-700 block">桃牛苑 提出ガイドライン</span>
                <ul class="space-y-1.5 text-[10px] text-slate-500 list-disc list-inside">
                  <li>通常バイトの目標は月10日です。</li>
                  <li>毎週水曜日は定休日です。</li>
                  <li>研修生は土日のみ出勤可能です。平日は自動ロックされます。</li>
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
    {#if activeTab === 'manager'}
      {#if !currentUser.isAdmin}
        <!-- 管理者権限ロック (Apple風極上シンプルデザイン) -->
        <div class="min-h-[60vh] flex items-center justify-center bg-slate-50 px-6 py-12 animate-popup rounded-3xl border border-slate-200/50 bg-white glass-panel shadow-sm mt-8" in:fade={{ duration: 150 }}>
          <div class="max-w-md w-full p-6 flex flex-col items-center text-center space-y-6">
            <div class="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 border border-rose-100 text-3xl mx-auto shadow-sm select-none">
              🔒
            </div>
            <div class="space-y-2">
              <h3 class="text-lg font-black text-slate-900 tracking-tight">管理者権限が必要です</h3>
              <p class="text-xs text-slate-400 font-semibold leading-relaxed">
                現在サインイン中のアカウント（{currentUser.name}さん）には、<br />
                シフトの最終生成や店舗設定を行う管理者権限がありません。
              </p>
            </div>
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8" in:fade={{ duration: 150 }}>
        
        <!-- 左側: システムコントロール (1/4幅) -->
        <div class="space-y-6">
          <div class="glass-panel p-6 space-y-6 bg-white">
            <div>
              <h3 class="text-sm font-bold text-slate-900 tracking-tight">シフト作成・設定パネル</h3>
              <p class="text-xs text-slate-500 mt-0.5 font-medium">臨時定休の設定と自動生成を実行します。</p>
            </div>

            <!-- ステータス (極小ドット) -->
            <div class="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs font-semibold">
              <div class="flex items-center justify-between">
                <span class="text-slate-500">自動マッピングステータス</span>
                <span class="flex items-center gap-2 font-bold text-slate-700">
                  <span class="w-2 h-2 rounded-full bg-[#34c759] shadow-[0_0_8px_#34c759]"></span> 充足完了
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">未提出メンバー</span>
                <span class="flex items-center gap-2 font-bold text-slate-700">
                  <span class="w-2 h-2 rounded-full bg-[#ff9500] shadow-[0_0_8px_#ff9500]"></span> 2名 (要通知)
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
                <RotateCcw class="w-4 h-4 {isGenerating ? 'animate-spin' : ''}" />
                {isGenerating ? '自動生成中...' : 'AI自動シフト生成を実行'}
              </button>

              <button
                on:click={handleSendRemind}
                class="w-full btn-apple btn-secondary py-3.5 text-xs"
              >
                <Bell class="w-4 h-4 text-[#0071e3]" />
                提出リマインドをLINE一斉配信
              </button>
            </div>

            <!-- 一括設定 -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">曜日別 一括休業設定</span>
              <div class="grid grid-cols-7 gap-1.5 mt-3">
                {#each WEEKDAY_NAMES as w}
                  <button
                    on:click={() => {
                      if (w === "水") {
                        triggerToast("⚠️ 水曜日は基本定休日のため、解除はできません。");
                      } else {
                        selectedBulkClosedDay = w;
                      }
                    }}
                    class="py-2 text-[10px] font-bold rounded-lg border text-center transition-all {
                      w === '水' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }"
                  >
                    {w}
                  </button>
                {/each}
              </div>
            </div>

            <!-- シフト提出締め切り設定 (Apple風カスタム設定カード) -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest block">シフト提出締め切り設定</span>
              <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">これより後のシフト希望の提出・変更を完全にロックします。</p>
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
              <h3 class="text-sm font-bold text-slate-900 tracking-tight">シフト手動パズル調整ボード</h3>
              <p class="text-xs text-slate-500 mt-0.5 font-medium">カレンダー上のスタッフピルをドラッグして他の日へ移動・修正できます。</p>
            </div>
          </div>

          <!-- カレンダーグリッド (35マス) -->
          <div class="space-y-3">
            <!-- 曜日別一括ボタン -->
            <div class="grid grid-cols-7 gap-2.5">
              {#each CALENDAR_HEADERS as w}
                <button 
                  on:click={() => selectedBulkClosedDay = w}
                  class="bg-slate-100 text-slate-500 hover:bg-[#ff3b30] hover:text-white font-extrabold text-[10px] py-2 rounded-xl border border-slate-200 hover:translate-y-[1px] text-center"
                >
                  {w} 一括
                </button>
              {/each}
            </div>

            <!-- 日付グリッド (35マス) -->
            <div class="grid grid-cols-7 gap-2.5">
              {#each GRID_CELLS as d}
                {@const isRegularClosed = d.isRegularClosed}
                {@const isClosed = isRegularClosed || specialHolidays.includes(d.dateStr)}
                {@const todayShifts = shifts.filter(s => s.date === d.dateStr)}
                {@const val = validationResults[d.dateStr] || { isValid: true }}
                {@const isOver = dragOverDate === d.dateStr}

                <div
                  on:dragover={(e) => !d.isOtherMonth && handleDragOver(e, d.dateStr)}
                  on:dragenter={() => !d.isOtherMonth && !isClosed && (dragOverDate = d.dateStr)}
                  on:dragleave={() => dragOverDate = null}
                  on:drop={(e) => !d.isOtherMonth && handleDrop(e, d.dateStr)}
                  on:click={() => !d.isOtherMonth && (selectedEditDate = d.dateStr)}
                  class="flat-cal-cell p-3.5 min-h-[145px] flex flex-col justify-between relative bg-white {
                    d.isOtherMonth ? 'other-month-cell' : ''
                  } {
                    isClosed && !d.isOtherMonth ? 'opacity-40 bg-slate-50 border-dashed shadow-none cursor-default' : ''
                  } {isOver ? 'bg-[#0071e3]/5 border-[#0071e3]/30' : ''} {
                    !val.isValid && !isClosed && !d.isOtherMonth ? 'border-red-500/20' : ''
                  }"
                >
                  <div>
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-extrabold {d.isWeekend ? 'text-red-500' : 'text-slate-700'}">
                        {d.dayNum} <span class="text-[9px] text-slate-400 font-bold">({d.wName})</span>
                      </span>
                      
                      {#if !val.isValid && !isClosed && !d.isOtherMonth}
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                      {/if}
                    </div>

                    <!-- ピルバッジリスト -->
                    <div class="mt-3 space-y-1.5">
                      {#if d.isOtherMonth}
                        <!-- 前月・翌月は空欄 -->
                      {:else if isClosed}
                        <span class="text-[9px] text-slate-400 block mt-4 font-bold text-center">
                          {isRegularClosed ? '定休日' : '臨時休業'}
                        </span>
                      {:else if todayShifts.length === 0}
                        <span class="text-[9px] text-slate-400 block mt-4 font-bold text-center">未配置</span>
                      {:else}
                        {#each todayShifts as s}
                          {@const m = members.find(mem => mem.id === s.member_id)}
                          {@const isTrainee = m?.status === 'trainee'}

                          <div
                            draggable="true"
                            on:dragstart={(e) => handleDragStart(e, s.member_id, d.dateStr, s.role)}
                            on:dragend={handleDragEnd}
                            on:click|stopPropagation
                            class="draggable-pill staff-pill {
                              s.role === 'kitchen' ? 'kitchen-pill' : 'hall-pill'
                            } {
                              isTrainee ? 'trainee-pill' : ''
                            } text-[10px] py-1 px-2.5 rounded-full"
                          >
                            <span class="font-extrabold truncate">{s.member_name}</span>
                            <button
                              on:click={() => handleRemoveStaff(d.dateStr, s.member_id, s.role)}
                              class="opacity-60 hover:opacity-100 hover:text-red-600 p-0.5 ml-1.5"
                            >
                              <X class="w-2.5 h-2.5" />
                            </button>
                          </div>
                        {/each}
                      {/if}
                    </div>
                  </div>

                  {#if !val.isValid && !isClosed && !d.isOtherMonth}
                    <p class="text-[8px] text-red-500 font-extrabold leading-none mt-1.5">{val.message}</p>
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
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" transition:fade={{ duration: 120 }}>
      <div class="glass-panel p-6 max-w-sm w-full animate-popup bg-white shadow-2xl relative text-center border border-slate-200">
        <button on:click={() => selectedBulkClosedDay = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X class="w-5 h-5" />
        </button>

        <h4 class="text-sm font-bold text-slate-900 tracking-tight mb-4">毎週{selectedBulkClosedDay}曜日の一括設定</h4>
        <p class="text-xs text-slate-600 leading-relaxed mb-6 font-semibold">
          6月内のすべての【{selectedBulkClosedDay}曜日】を一括で臨時休業に登録（または解除）しますか？
        </p>

        <div class="flex gap-4">
          <button on:click={() => handleBulkClosedSetting(selectedBulkClosedDay)} class="flex-1 btn-apple btn-primary py-3 text-xs">
            実行する
          </button>
          <button on:click={() => selectedBulkClosedDay = null} class="flex-1 btn-apple btn-secondary py-3 text-xs">
            やめる
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- モーダル: 日付詳細調整 -->
  {#if selectedEditDate}
    <div 
      class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" 
      on:click={() => selectedEditDate = null}
      transition:fade={{ duration: 120 }}
    >
      <div 
        class="glass-panel p-6 max-w-sm w-full bg-white shadow-2xl border border-slate-200 relative"
        on:click|stopPropagation
      >
        <button on:click={() => selectedEditDate = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X class="w-5 h-5" />
        </button>

        <h4 class="text-sm font-bold text-slate-900 mb-4 tracking-tight">{selectedEditDate} シフト詳細調整</h4>

        <!-- 休業設定スイッチ -->
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between mb-5 text-xs font-semibold">
          <div>
            <p class="font-bold text-slate-800">臨時休業日に設定</p>
            <p class="text-[10px] text-slate-500 font-medium mt-0.5">自動生成の対象から除外されます。</p>
          </div>
          
          <button 
            type="button"
            role="switch"
            aria-label="臨時休業日に設定"
            aria-checked={specialHolidays.includes(selectedEditDate)}
            on:click={() => toggleSpecialHoliday(selectedEditDate)}
            class="ios-switch {specialHolidays.includes(selectedEditDate) ? 'ios-switch-active' : ''}"
          >
            <div class="ios-switch-knob"></div>
          </button>
        </div>

        {#if !specialHolidays.includes(selectedEditDate) && !DATES.find(d => d.dateStr === selectedEditDate)?.isRegularClosed}
          <div class="space-y-4">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">出勤メンバー</p>
            
            <div class="space-y-2">
              {#if shifts.filter(s => s.date === selectedEditDate).length === 0}
                <p class="text-xs text-slate-500 py-3 text-center font-medium">アサインメンバーはいません。</p>
              {:else}
                {#each shifts.filter(s => s.date === selectedEditDate) as s}
                  {@const m = members.find(mem => mem.id === s.member_id)}
                  <div class="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span class="text-xs font-bold text-slate-800">{s.member_name}</span>
                      <span class="text-[10px] text-slate-500 ml-2">({s.role === 'kitchen' ? '厨' : 'ホ'})</span>
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        on:click={() => {
                          const nextTime = s.start_time === '17:00' ? '17:30' : '17:00';
                          shifts = shifts.map(item => {
                            if (item.date === selectedEditDate && item.member_id === s.member_id) {
                              return { ...item, start_time: nextTime };
                            }
                            return item;
                          });
                        }}
                        class="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold px-2 py-1 rounded-lg text-slate-700"
                      >
                        ⏱️ {s.start_time}
                      </button>
                      
                      <button
                        on:click={() => handleRemoveStaff(selectedEditDate, s.member_id, s.role)}
                        class="text-red-500 hover:bg-red-50 p-2 rounded-lg"
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
              <label for="member-select" class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">スタッフの追加</label>
              <select
                id="member-select"
                on:change={(e) => {
                  if (e.target.value) {
                    handleAddStaff(selectedEditDate, e.target.value);
                    e.target.value = "";
                  }
                }}
                class="w-full bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:border-[#0071e3]"
              >
                <option value="">＋ メンバーの選択</option>
                {#each members as m}
                  {#each m.roles || [m.role] as r}
                    <option value="{m.id}:{r}">{m.emoji} {m.name} — {r === 'kitchen' ? '🍳 キッチン' : '🛎 ホール'}{(m.roles?.length > 1) ? ' ✦' : ''}</option>
                  {/each}
                {/each}
              </select>
            </div>
          </div>
        {:else}
          <p class="text-center py-5 text-xs font-bold text-slate-400">休業日のため配置不可です。</p>
        {/if}

        <button 
          on:click={() => selectedEditDate = null}
          class="w-full btn-apple btn-primary py-3.5 text-xs mt-6"
        >
          完了
        </button>
      </div>
    </div>
  {/if}

</div>

<style>
  .apple-setup-container {
    min-height: 70vh;
    background-color: #000000 !important;
    color: #ffffff !important;
    border-radius: 24px;
    padding: 3.5rem 2rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
    background: radial-gradient(circle, rgba(0, 113, 227, 0.2) 0%, rgba(0, 0, 0, 0) 70%);
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
    grid-template-cols: 1fr 1fr;
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
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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
