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

  // Web Push VAPID public key
  import { VAPID_KEY } from "./firebase.js";

  /**
   * @typedef {Object} Member
   * @property {number} id
   * @property {string} name
   * @property {string} [initialChar]
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
   * @property {boolean} [isActive]
   * @property {string} [passcode]
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
  /** @type {Member[]} */
  const INITIAL_MEMBERS = [];

  // 初期シフト (実環境移行のため空配列)
  /** @type {Shift[]} */
  const DEFAULT_SHIFTS = [];

  function getCurrentMonthPeriod(now = new Date()) {
    const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    return `${jstDate.getFullYear()}-${String(jstDate.getMonth() + 1).padStart(2, "0")}`;
  }

  function getSubmissionPeriod(now = new Date()) {
    const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const year = jstDate.getFullYear();
    const month = jstDate.getMonth() + 1; // 1-12
    const day = jstDate.getDate();

    if (day <= 10) {
      // 10日が終わるまでは当月の後半B期間
      return `${year}-${String(month).padStart(2, "0")}-B`;
    } else if (day <= 25) {
      // 11日〜25日が終わるまでは翌月の前半A期間
      const nextDate = new Date(year, jstDate.getMonth() + 1, 1);
      const nextYear = nextDate.getFullYear();
      const nextMonth = nextDate.getMonth() + 1;
      return `${nextYear}-${String(nextMonth).padStart(2, "0")}-A`;
    } else {
      // 26日以降は翌月の後半B期間
      const nextDate = new Date(year, jstDate.getMonth() + 1, 1);
      const nextYear = nextDate.getFullYear();
      const nextMonth = nextDate.getMonth() + 1;
      return `${nextYear}-${String(nextMonth).padStart(2, "0")}-B`;
    }
  }

  /**
   * @param {string} periodStr
   */
  function getDeadlineInfo(periodStr) {
    if (!periodStr) return null;
    const parts = periodStr.split("-");
    if (parts.length < 3) return null;
    
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const half = parts[2];
    
    const now = new Date();
    const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const currentYear = jstDate.getFullYear();
    const currentMonthNum = jstDate.getMonth() + 1;

    if (half === "B") {
      const isSameMonth = (currentYear === year && currentMonthNum === month);
      const deadlineDate = new Date(year, month - 1, 10, 23, 59, 59);
      const isPast = jstDate > deadlineDate;

      if (isPast) {
        return {
          type: "warning",
          title: `${month}月後半シフト希望提出`,
          mainLabel: "⚠️ 提出期限を過ぎています！",
          value: `${month}月10日 23:59 締切`,
          description: "期限を過ぎたため、本アプリからの提出や変更はロックされています。シフト希望がある場合は、店長のLINE宛てに直接メッセージを送信してください。"
        };
      } else {
        return {
          type: "normal",
          title: `${month}月後半シフト希望提出`,
          mainLabel: "📅 シフト希望提出締め切り日時",
          value: `${month}月10日 23:59 まで`,
          description: "※期限厳守でのご提出をお願いいたします。締め切り後は変更ができなくなりますのでご注意ください。"
        };
      }
    } else {
      const prevMonthDate = new Date(year, month - 2, 1);
      const prevMonth = prevMonthDate.getMonth() + 1;
      const prevYear = prevMonthDate.getFullYear();

      const deadlineDate = new Date(prevYear, prevMonth - 1, 25, 23, 59, 59);
      const isPast = jstDate > deadlineDate;

      if (isPast) {
        return {
          type: "warning",
          title: `${month}月前半シフト希望提出`,
          mainLabel: "⚠️ 提出期限を過ぎています！",
          value: `${prevMonth}月25日 23:59 締切`,
          description: "期限を過ぎたため、本アプリからの提出や変更はロックされています。シフト希望がある場合は、店長のLINE宛てに直接メッセージを送信してください。"
        };
      } else {
        return {
          type: "normal",
          title: `${month}月前半シフト希望提出`,
          mainLabel: "📅 シフト希望提出締め切り日時",
          value: `${prevMonth}月25日 23:59 まで`,
          description: "※期限厳守でのご提出をお願いいたします。締め切り後は変更ができなくなりますのでご注意ください。"
        };
      }
    }
  }

  /**
   * @param {string} tab
   */
  async function changeTab(tab) {
    activeTab = tab;
    const now = new Date();
    
    if (tab === "calendar") {
      currentPeriod = getCurrentMonthPeriod(now);
    } else if (tab === "submissions") {
      currentPeriod = getSubmissionPeriod(now);
    } else if (tab === "manager") {
      if (currentPeriod.split("-").length < 3) {
        currentPeriod = getSubmissionPeriod(now);
      }
    }
    
    await handlePeriodChange();
  }

  // 月度ステート
  let currentPeriod = getCurrentMonthPeriod();

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
    const foundMember = membersList.find((m) => m.name === name);
    if (foundMember && foundMember.initialChar) {
      return foundMember.initialChar;
    }
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
  $: currentMonth = currentPeriod.substring(0, 7);
  $: DATES = generateDates(currentPeriod);
  $: GRID_CELLS = generateGridCells(currentPeriod);
  $: DATES_MONTH = generateDates(currentMonth);
  $: GRID_CELLS_MONTH = generateGridCells(currentMonth);

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
  let shiftStatusA = "draft";
  let shiftStatusB = "draft";
  let isGenerating = false;
  /** @type {string | null} */
  let toastMessage = null;
  let activeQuickMenuDate = null; // iOS風臨時休業選択用クイックポップアップ状態

  // 個人シフト希望確認モーダル用ステート
  /** @type {Member | null} */
  let selectedModalMember = null;

  $: currentPeriodLabel = (() => {
    const matched = selectablePeriods.find(p => p.value === currentPeriod);
    return matched ? matched.label : currentPeriod;
  })();

  $: modalAvailabilities = (() => {
    const member = selectedModalMember;
    if (!member) return {};
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    if (currentPeriod.length === 7) {
      const subA = allSubmissions.find(s => s.staffId === memberId && s.period === `${baseMonth}-A`);
      const subB = allSubmissions.find(s => s.staffId === memberId && s.period === `${baseMonth}-B`);
      return {
        ...(subA?.availabilities || {}),
        ...(subB?.availabilities || {})
      };
    } else {
      const sub = allSubmissions.find(s => s.staffId === memberId && s.period === currentPeriod);
      return sub?.availabilities || {};
    }
  })();

  $: modalSubmitPattern = (() => {
    const member = selectedModalMember;
    if (!member) return "A";
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    const sub = allSubmissions.find(s => s.staffId === memberId && s.period.startsWith(baseMonth));
    return sub?.submitPattern || "A";
  })();

  $: isModalSubmitted = (() => {
    const member = selectedModalMember;
    if (!member) return false;
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    if (currentPeriod.length === 7) {
      const subA = allSubmissions.find(s => s.staffId === memberId && s.period === `${baseMonth}-A`);
      const subB = allSubmissions.find(s => s.staffId === memberId && s.period === `${baseMonth}-B`);
      return (subA?.isSubmitted === true) && (subB?.isSubmitted === true);
    } else {
      const sub = allSubmissions.find(s => s.staffId === memberId && s.period === currentPeriod);
      return sub?.isSubmitted === true;
    }
  })();

  $: modalGridCells = generateGridCells(currentPeriod);

  /**
   * @param {Member} member
   */
  function openWishPreviewModal(member) {
    selectedModalMember = member;
  }

  let loginPasscode = "";
  let loginScreenMode = "login"; // 'register' | 'login'
  let regPasscode = "";

  // 新規追加: 招待コード・IDログイン用
  let loginStaffIdInput = "";
  let loginPasswordInput = "";
  let regInviteCode = "";
  let regInviteName = "";


  // クイックログイン用
  /** @type {Member | null} */
  let selectedQuickLoginMember = null;
  let quickLoginPasscode = "";

  $: if (members && members.filter(m => m.isActive !== false).length === 0) {
    loginScreenMode = "register";
  }

  /**
   * @param {Member} member
   */
  async function handleSelectStaffLogin(member) {
    const code = loginPasscode.trim();
    const isCorrect = member.passcode
      ? code === member.passcode
      : (code === "8929" || code === "8888");
      
    if (!isCorrect) {
      triggerToast("⚠️ パスコードが正しくありません。");
      return;
    }

    const registeredUser = {
      ...member,
      avatar: member.emoji || (member.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!member.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    triggerToast(`💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`);

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    loginPasscode = "";
  }

  // --- 新ログイン/登録処理ロジック (UXリファイン統合) ---
  async function handleIdLogin() {
    const idStr = loginStaffIdInput.trim();
    const pass = loginPasswordInput.trim();

    if (!idStr) {
      triggerToast("⚠️ スタッフIDを入力してください。");
      return;
    }
    if (!pass) {
      triggerToast("⚠️ パスワード（暗証番号）を入力してください。");
      return;
    }

    const match = idStr.match(/\d+/);
    if (!match) {
      triggerToast("⚠️ 正しいスタッフID（例: TN-00005）を入力してください。");
      return;
    }
    const idNum = parseInt(match[0], 10);

    const member = members.find(m => Number(m.id) === idNum && m.isActive !== false);
    if (!member) {
      triggerToast("⚠️ 該当するスタッフが見つかりません。");
      return;
    }

    const isCorrect = member.passcode
      ? pass === member.passcode
      : (pass === "8929" || pass === "8888");

    if (!isCorrect) {
      triggerToast("⚠️ パスワードが正しくありません。");
      return;
    }

    const registeredUser = {
      ...member,
      avatar: member.emoji || (member.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!member.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    triggerToast(`💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`);

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    loginStaffIdInput = "";
    loginPasswordInput = "";
  }

  async function handleInviteRegister() {
    const code = regInviteCode.trim();
    const name = regInviteName.trim();

    if (!code) {
      triggerToast("⚠️ 招待コードを入力してください。");
      return;
    }
    if (!name) {
      triggerToast("⚠️ お名前を入力してください。");
      return;
    }

    if (code !== "8929" && code !== "8888") {
      triggerToast("⚠️ 招待コードが正しくありません。店舗管理者に確認してください。");
      return;
    }

    isRegistering = true;
    try {
      // 招待コード登録時は、デフォルトで「ホール」ロール、ステータスは「regular」、初期パスコードは "8888" とする
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          initialChar: name.substring(0, 1),
          roles: regRoles && regRoles.length ? regRoles : ["hall"],
          status: regIsTrainee ? "trainee" : "regular",
          passcode: "8888" // デフォルト初期値
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.registered) {
        const registeredUser = {
          ...data.user,
          avatar: regRoles && regRoles.includes("kitchen") ? "👨‍🍳" : "👩‍💼",
          isAdmin: !!data.user.isAdmin,
        };
        currentUser = registeredUser;

        localStorage.setItem("currentUser", JSON.stringify(registeredUser));
        triggerToast(
          `💚 登録が完了しました！${registeredUser.name}さん、歓迎します。スタッフID: TN-${String(registeredUser.id).padStart(5, '0')}`,
        );

        regInviteCode = "";
        regInviteName = "";
        regRoles = [];
        regIsTrainee = false;

        await fetchMembers();
        selectedStaffId = registeredUser.id;
        await loadStaffSubmissions(registeredUser.id);
        requestPushSubscription(registeredUser.id).catch(console.error);
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 登録エラー: ${err.message}`);
    } finally {
      isRegistering = false;
    }
  }

  async function handleQuickLoginSubmit() {
    if (!selectedQuickLoginMember) return;
    const code = quickLoginPasscode.trim();

    if (!code) {
      triggerToast("⚠️ パスコードを入力してください。");
      return;
    }

    const isCorrect = selectedQuickLoginMember.passcode
      ? code === selectedQuickLoginMember.passcode
      : (code === "8929" || code === "8888");

    if (!isCorrect) {
      triggerToast("⚠️ パスコードが正しくありません。");
      return;
    }

    const registeredUser = {
      ...selectedQuickLoginMember,
      avatar: selectedQuickLoginMember.emoji || (selectedQuickLoginMember.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!selectedQuickLoginMember.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    triggerToast(`💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`);

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    selectedQuickLoginMember = null;
    quickLoginPasscode = "";
  }

  /**
   * @param {number} memberId
   * @param {boolean} isAdmin
   */
  async function toggleAdminPrivilege(memberId, isAdmin) {
    try {
      const res = await fetch("/api/members/update-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, isAdmin }),
      });
      if (res.ok) {
        // Update local members array
        members = members.map((m) => {
          if (m.id === memberId) {
            return { ...m, isAdmin };
          }
          return m;
        });

        // If the logged-in user changed their own privilege, update local session too
        if (currentUser && currentUser.id === memberId) {
          const updatedUser = { ...currentUser, isAdmin };
          currentUser = updatedUser;
          localStorage.setItem("currentUser", JSON.stringify(updatedUser));
        }

        const mName = members.find((m) => m.id === memberId)?.name || "スタッフ";
        triggerToast(
          isAdmin
            ? `👑 ${mName}さんに管理者権限を付与しました。`
            : `👤 ${mName}さんの管理者権限を剥奪しました。`
        );
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("管理者権限の更新に失敗しました:", err);
      triggerToast(`⚠️ 権限更新失敗: ${err.message}`);
    }
  }

  async function handleDatabaseReset() {
    const ok = confirm("🚨 警告: データベース（全スタッフ、全希望データ）を完全にリセットします。よろしいですか？");
    if (!ok) return;

    const finalOk = confirm("⚠️ 本当に実行しますか？この操作は絶対に元に戻せません！");
    if (!finalOk) return;

    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        handleSignOut();
      } else {
        throw new Error(await res.text());
      }
    } catch (e) {
      const err = /** @type {any} */ (e);
      alert(`⚠️ リセットに失敗しました: ${err.message}`);
    }
  }

  // 提出保存・締め切り用の新規ステート
  let isSubmitting = false;
  let deadlineDate = "2026-05-30T23:59:59";
  let deadlineInput = "2026-05-30T23:59";
  let isLocked = false;
  let isAutoSaving = false;
  let hasPendingChanges = false;
  /** @type {any} */
  let saveTimeout = null;

  // 自律型遅刻救済のための動的締め切り計算
  /**
   * @param {string} periodStr
   */
  function getDeadlineDateForPeriod(periodStr) {
    if (!periodStr) return null;
    const parts = periodStr.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const half = parts[2]; // 'A' or 'B'
    if (half === "B") {
      // 当月10日 23:59:59
      return new Date(year, month - 1, 10, 23, 59, 59);
    } else if (half === "A") {
      // 前月25日 23:59:59
      return new Date(year, month - 2, 25, 23, 59, 59);
    }
    return null;
  }



  $: selectablePeriods = (activeTab === "calendar")
    ? [
        { value: "2026-06", label: "2026年6月" },
        { value: "2026-07", label: "2026年7月" },
        { value: "2026-08", label: "2026年8月" }
      ]
    : [
        { value: "2026-06-A", label: "2026年6月 前半 (1日〜15日) " },
        { value: "2026-06-B", label: "2026年6月 後半 (16日〜末日)" },
        { value: "2026-07-A", label: "2026年7月 前半 (1日〜15日)" },
        { value: "2026-07-B", label: "2026年7月 後半 (16日〜末日)" },
        { value: "2026-08-A", label: "2026年8月 前半 (1日〜15日)" },
        { value: "2026-08-B", label: "2026年8月 後半 (16日〜末日)" }
      ];

  $: deadlineInfo = getDeadlineInfo(currentPeriod);

  $: deadlineObj = getDeadlineDateForPeriod(currentPeriod);
  $: isPastDeadline = deadlineObj ? new Date() > deadlineObj : false;
  $: mySubmission = allSubmissions.find(
    (sub) => sub.period === currentPeriod && Number(sub.staffId) === Number(currentUser?.id)
  );
  $: isSubmitted = mySubmission ? mySubmission.isSubmitted === true : false;
  $: isLocked = !currentUser?.isAdmin && isPastDeadline;

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
    (m) => m.isActive !== false && !submittedStaffIds.has(Number(m.id))
  );
  $: unsubmittedCount = unsubmittedMembers.length;



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

  // Web Push 通知用ステート
  let pushPermissionStatus = "idle"; // 'idle' | 'requesting' | 'granted' | 'denied'

  // Web Push 購読処理
  /**
   * @param {number} memberId
   */
  async function requestPushSubscription(memberId) {
    if (typeof window === "undefined" || !memberId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[Push] このブラウザは通知をサポートしていません。');
      pushPermissionStatus = "denied";
      return;
    }

    if (Notification.permission === 'default') {
      pushPermissionStatus = "requesting";
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.info('[Push] 通知許可が得られませんでした。');
        pushPermissionStatus = "denied";
        return;
      }

      pushPermissionStatus = "granted";

      const registration = await navigator.serviceWorker.ready;

      // 既存の購読が残っていた場合は一旦解除してクリーンに再登録する
      // (applicationServerKey が変わると InvalidStateError が発生するため)
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.info('[Push] 既存の購読を解除してクリーン再登録します...');
        await existingSubscription.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
      });

      console.info('[Push] 購読成功:', subscription.endpoint);

      const res = await fetch("/api/auth/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          subscription
        })
      });

      if (res.ok) {
        triggerToast("🔔 プッシュ通知の設定が完了しました！");
      } else {
        console.error("プッシュ購読情報の保存に失敗しました:", await res.text());
      }
    } catch (err) {
      console.error("[Push] 購読処理中にエラーが発生しました:", err);
      pushPermissionStatus = "denied";
    }
  }

  /**
   * @param {string} base64String
   */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }



  function handleSignOut() {
    currentUser = null;
    localStorage.removeItem("currentUser");
    regName = "";
    regInitialChar = "";
    regRoles = [];
    regIsTrainee = false;
    staffAvailabilities = {};
    activeTab = "calendar"; // シフト表へリダイレクト
    triggerToast("👋 サインアウトしました。セッションを終了しました。");
  }

  // 初回プロフィール作成フォーム用のリアクティブ変数
  let regName = "";
  let regInitialChar = "";
  /** @type {string[]} */
  let regRoles = []; // ["kitchen"], ["hall"], ["kitchen", "hall"]
  let regIsTrainee = false;
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
    const cleanPasscode = regPasscode.trim();
    if (!cleanPasscode || cleanPasscode.length !== 4 || !/^\d{4}$/.test(cleanPasscode)) {
      triggerToast("⚠️ ログイン用のパスコード（数字4桁）を入力してください。");
      return;
    }

    isRegistering = true;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          initialChar: regInitialChar.trim(),
          roles: regRoles,
          status: regIsTrainee ? "trainee" : "regular",
          passcode: cleanPasscode
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
        regName = "";
        regInitialChar = "";
        regRoles = [];
        regIsTrainee = false;
        regPasscode = "";

        // メンバーリストを再取得してカレンダー上の表示を更新
        await fetchMembers();

        selectedStaffId = registeredUser.id;
        await loadStaffSubmissions(registeredUser.id);

        // プッシュ通知購読を設定
        requestPushSubscription(registeredUser.id).catch(console.error);
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
    async function init() {
      // 0. マウント時にFirestoreから臨時休業データ、メンバー一覧、公開ステータスを取得
      await fetchHolidays();
      await fetchMembers();
      await fetchShiftStatus(currentPeriod);
      await fetchSubmissions();

      // 1. ローカルストレージから既存のサインインセッションを復元
      const cachedUser = localStorage.getItem("currentUser");
      if (cachedUser) {
        try {
          const parsedUser = JSON.parse(cachedUser);
          if (parsedUser && parsedUser.id) {
            // Firestoreから取得した最新メンバーリストでキャッシュを更新（isAdminなどを最新化）
            const freshMember = members.find(m => m.id === parsedUser.id);
            if (freshMember) {
              const refreshedUser = {
                ...parsedUser,
                ...freshMember,
                avatar: parsedUser.avatar || freshMember.emoji || '👩‍💼',
                isAdmin: !!freshMember.isAdmin
              };
              currentUser = refreshedUser;
              // キャッシュを最新データで上書き
              localStorage.setItem("currentUser", JSON.stringify(refreshedUser));
            } else {
              // メンバーリストに存在しなくなった場合はキャッシュをクリア
              console.warn('[App] Cached user not found in members. Clearing session.');
              localStorage.removeItem("currentUser");
            }

            if (currentUser) {
              // バックグラウンドでWeb Push購読を確認・更新
              requestPushSubscription(currentUser.id).catch(console.error);
              selectedStaffId = currentUser.id;
              loadStaffSubmissions(currentUser.id).catch(console.error);
            }
          }
        } catch (e) {
          localStorage.removeItem("currentUser");
        }
      }

      // 2. ブラウザ通知許可の確認と初期設定
      if (typeof window !== "undefined" && 'Notification' in window) {
        if (Notification.permission === "granted") {
          pushPermissionStatus = "granted";
          if (currentUser) {
            requestPushSubscription(currentUser.id).catch(console.error);
          }
        } else if (Notification.permission === "denied") {
          pushPermissionStatus = "denied";
        } else {
          pushPermissionStatus = "idle";
        }
      }

      // 既存の初期化処理
      await loadShifts(currentPeriod);
      fetchDeadline();
    }

    init();

    return () => {};
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

  $: isVisibleA = currentUser?.isAdmin || shiftStatusA === "published";
  $: isVisibleB = currentUser?.isAdmin || shiftStatusB === "published";

  $: memberAssignedStats = members.map((m) => {
    // Only count shifts that are visible to the user
    const visibleShifts = shifts.filter((s) => {
      if (s.member_id !== m.id) return false;
      if (!s.date) return false;
      const day = Number(s.date.split("-")[2]);
      return day <= 15 ? isVisibleA : isVisibleB;
    });

    const count = visibleShifts.length;
    const rawTarget = m.targetDays !== undefined ? m.targetDays : 10;

    let targetDays;
    if (isVisibleA && isVisibleB) {
      targetDays = rawTarget;
    } else if (isVisibleA || isVisibleB) {
      targetDays = rawTarget > 7 ? Math.floor(rawTarget / 2) : rawTarget;
    } else {
      targetDays = 0;
    }

    const target = m.status === "trainee" ? "土日" : targetDays;
    const isOk = m.status === "trainee" ? count > 0 : count === targetDays;
    const isUnder = m.status === "regular" && count < targetDays;
    const isOver = m.status === "regular" && count > targetDays;
    return {
      ...m,
      isActive: m.isActive !== false,
      count,
      target,
      isOk,
      isUnder,
      isOver,
    };
  }).filter((m) => m.isActive !== false || (shiftStatus === "published" && m.count > 0));

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
      const baseMonth = currentPeriod.substring(0, 7); // e.g. "2026-06"
      
      const shiftsA = currentShifts.filter((s) => {
        if (!s.date || !s.date.startsWith(baseMonth)) return false;
        const day = Number(s.date.split("-")[2]);
        return day <= 15;
      });
      
      const shiftsB = currentShifts.filter((s) => {
        if (!s.date || !s.date.startsWith(baseMonth)) return false;
        const day = Number(s.date.split("-")[2]);
        return day >= 16;
      });

      // Save both halves
      const [resA, resB] = await Promise.all([
        fetch("/api/shifts/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shifts: shiftsA, period: `${baseMonth}-A` }),
        }),
        fetch("/api/shifts/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shifts: shiftsB, period: `${baseMonth}-B` }),
        })
      ]);

      if (!resA.ok || !resB.ok) {
        throw new Error("保存処理に失敗しました。");
      }
      console.info("[App] Shift saved successfully for both halves.");
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("シフトの手動保存に失敗しました:", err);
      triggerToast(`⚠️ シフトの自動保存に失敗しました: ${err.message}`);
    }
  }

  async function loadShifts(targetPeriod = "2026-06") {
    const baseMonth = targetPeriod.substring(0, 7); // e.g. "2026-06"
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/shifts?period=${baseMonth}-A`),
        fetch(`/api/shifts?period=${baseMonth}-B`),
      ]);
      let shiftsA = [];
      let shiftsB = [];
      if (resA.ok) {
        shiftsA = await resA.json();
      }
      if (resB.ok) {
        shiftsB = await resB.json();
      }
      shifts = [...shiftsA, ...shiftsB];
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

  /**
   * @param {number} memberId
   * @param {boolean} isActive
   */
  async function toggleMemberActive(memberId, isActive) {
    try {
      const res = await fetch("/api/members/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, isActive }),
      });
      if (res.ok) {
        // Update local members array
        members = members.map((m) => {
          if (m.id === memberId) {
            return { ...m, isActive };
          }
          return m;
        });
        
        const mName = members.find((m) => m.id === memberId)?.name || "スタッフ";
        triggerToast(
          isActive 
            ? `💚 ${mName}さんを有効（復職）に戻しました。` 
            : `📁 ${mName}さんを退職処理（非表示）にしました。`
        );
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("メンバーのステータス更新に失敗しました:", err);
      triggerToast(`⚠️ ステータス更新失敗: ${err.message}`);
    }
  }

  async function fetchShiftStatus(targetPeriod = "2026-06") {
    const baseMonth = targetPeriod.substring(0, 7); // e.g. "2026-06"
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/shifts/status?period=${baseMonth}-A`),
        fetch(`/api/shifts/status?period=${baseMonth}-B`),
      ]);
      if (resA.ok) {
        const dataA = await resA.json();
        shiftStatusA = dataA.status || "draft";
      } else {
        shiftStatusA = "draft";
      }
      if (resB.ok) {
        const dataB = await resB.json();
        shiftStatusB = dataB.status || "draft";
      } else {
        shiftStatusB = "draft";
      }
      // Sync shiftStatus to the current active period's status
      if (targetPeriod.endsWith("-A")) {
        shiftStatus = shiftStatusA;
      } else if (targetPeriod.endsWith("-B")) {
        shiftStatus = shiftStatusB;
      } else {
        shiftStatus = shiftStatusA;
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
        if (targetPeriod.endsWith("-A")) {
          shiftStatusA = data.status;
        } else if (targetPeriod.endsWith("-B")) {
          shiftStatusB = data.status;
        }
        triggerToast("💚 シフトを確定公開しました！");
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
        if (targetPeriod.endsWith("-A")) {
          shiftStatusA = data.status;
        } else if (targetPeriod.endsWith("-B")) {
          shiftStatusB = data.status;
        }
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
          `📢 未提出の${data.remindedCount}名（${data.remindedNames.join(", ")}）へプッシュ通知を配信しました！`,
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
        const baseMonth = currentPeriod.substring(0, 7); // e.g. "2026-06"
        const half = currentPeriod.substring(8); // "A" or "B"
        const otherHalfShifts = shifts.filter((s) => {
          if (!s.date || !s.date.startsWith(baseMonth)) return true;
          const day = Number(s.date.split("-")[2]);
          if (half === "A") {
            return day >= 16;
          } else {
            return day <= 15;
          }
        });
        shifts = [...otherHalfShifts, ...data.shifts];
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
      isSubmitted: false,
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

  let isSubmittingShift = false;
  async function handleExplicitSubmit() {
    const m = members.find((mem) => mem.id === selectedStaffId);
    if (!m) return;
    
    isSubmittingShift = true;
    const payload = {
      staffId: m.id,
      period: currentPeriod,
      availabilities: staffAvailabilities,
      submitPattern: submitPattern,
      lineUserId: currentUser
        ? currentUser.lineUserId
        : m.lineUserId || `U06c755lineUser_${m.id}`,
      submittedAt: new Date().toISOString(),
      isSubmitted: true // Mark as explicitly submitted!
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
      if (data.shiftsUpdated) {
        await loadShifts(currentPeriod);
      }
      
      await fetchSubmissions();
      triggerToast("💚 希望シフトを提出しました！");
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 提出に失敗しました: ${err.message}`);
    } finally {
      isSubmittingShift = false;
    }
  }

  const WEEKDAY_NAMES = CALENDAR_HEADERS;
</script>

<div
  class="pb-16 text-slate-800 font-sans select-none selection:bg-[#0071e3]/20"
>
  <!-- Safari PWA 引き戻し案内画面 -->


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
  <!-- 通知許可プロンプトバナー（初回のみ・未決定の場合のみ表示）    -->
  <!-- ========================================================= -->
  {#if currentUser && pushPermissionStatus === "idle"}
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
              pushPermissionStatus = "denied";
            }}
            class="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg transition-colors"
          >
            後で
          </button>
          <button
            on:click={() => { if (currentUser) requestPushSubscription(currentUser.id); }}
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
          {#each selectablePeriods as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      </div>

      <!-- スタイリッシュセグメントタブ ＆ LINEユーザープロフィール -->
      <div
        class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto"
      >
        <div class="segmented-control w-full md:w-[480px]">
          <button
            on:click={() => changeTab("calendar")}
            class="segment-btn {activeTab === 'calendar' ? 'active' : ''}"
          >
            シフト表<span class="hidden-mobile">・カレンダー</span>
          </button>
          <button
            on:click={() => changeTab("submissions")}
            class="segment-btn {activeTab === 'submissions' ? 'active' : ''}"
          >
            希望提出
          </button>
          <button
            on:click={() => changeTab("manager")}
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
              class="w-6 h-6 rounded-full bg-[#0071e3]/10 flex items-center justify-center text-xs border border-[#0071e3]/20 select-none"
            >
              {currentUser.avatar}
            </div>
            <div class="text-left leading-none">
              <div
                class="text-[8px] text-slate-400 font-black uppercase tracking-wider"
              >
                サインイン中
              </div>
              <div
                class="text-[11px] font-bold text-slate-700 mt-0.5 flex items-center gap-1"
              >
                {currentUser.name}さん
                <span
                  class="text-[7px] bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 px-0.5 rounded font-extrabold"
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
      <!-- モバイル最新版 プレミアムデザインログイン (Bento Grid 統合) -->
      <div class="w-full max-w-[1000px] mx-auto py-8 animate-popup" in:fade={{ duration: 250 }}>
        <!-- Welcome Hero -->
        <div class="text-center mb-10">
          <h2 class="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">スタッフポータルへようこそ</h2>
          <p class="text-sm text-slate-500 font-medium">桃牛苑の業務をよりスムーズに、よりシンプルに。</p>
        </div>

        <!-- Bento Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <!-- Feature 1 -->
          <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-[#005bc1]/10 text-[#005bc1] flex items-center justify-center">
              <span class="material-symbols-outlined">calendar_month</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-800 mb-1">シフト確認</h3>
              <p class="text-xs text-slate-500 leading-relaxed">リアルタイムで自分のスケジュールをチェック。店舗の状況も一目で把握できます。</p>
            </div>
          </div>
          <!-- Feature 2 -->
          <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-[#008733]/10 text-[#008733] flex items-center justify-center">
              <span class="material-symbols-outlined">send</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-800 mb-1">希望提出</h3>
              <p class="text-xs text-slate-500 leading-relaxed">休暇や希望シフトの提出もアプリから。調整結果もすぐにプッシュ通知で届きます。</p>
            </div>
          </div>
          <!-- Feature 3 -->
          <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-[#ba1a1a]/10 text-[#ba1a1a] flex items-center justify-center">
              <span class="material-symbols-outlined">notifications_active</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-800 mb-1">重要なお知らせ</h3>
              <p class="text-xs text-slate-500 leading-relaxed">店舗からの緊急連絡や、マニュアルの更新などを逃さずキャッチアップ。</p>
            </div>
          </div>
        </div>

        <!-- Auth Card Container -->
        <div class="w-full max-w-md mx-auto bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
          <!-- Segmented Tab Control -->
          <div class="flex p-1.5 bg-slate-100 m-5 rounded-2xl">
            <button
              type="button"
              on:click={() => (loginScreenMode = "login")}
              class="flex-grow py-2.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer {loginScreenMode === 'login' ? 'bg-white text-[#005bc1] shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}"
            >
              スタッフログイン
            </button>
            <button
              type="button"
              on:click={() => (loginScreenMode = "register")}
              class="flex-grow py-2.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer {loginScreenMode === 'register' ? 'bg-white text-[#005bc1] shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}"
            >
              新規登録
            </button>
          </div>

          <!-- Form View -->
          {#if loginScreenMode === 'login'}
            <!-- Login Content -->
            <div class="px-6 pb-8 space-y-6" in:fade={{ duration: 150 }}>
              <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">クイックログイン</p>
                <div class="flex flex-col gap-3 max-h-64 overflow-y-auto hide-scrollbar p-1">
                  {#each members.filter(m => m.isActive !== false) as m}
                    <div class="flex flex-col bg-slate-50 border border-slate-200/60 rounded-2xl overflow-hidden transition-all duration-200">
                      <button
                        type="button"
                        on:click={() => handleQuickLoginSelect(m)}
                        class="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-all border-0 bg-transparent"
                      >
                        <div class="flex items-center gap-3 min-w-0">
                          <div class="w-10 h-10 rounded-xl bg-[#005bc1]/10 flex items-center justify-center text-sm font-extrabold text-[#005bc1] shrink-0 border border-solid border-[#005bc1]/5 select-none">
                            {m.initialChar || m.name.charAt(0)}
                          </div>
                          <div class="truncate">
                            <p class="text-sm font-bold text-slate-800 truncate leading-tight">{m.name} {m.emoji || ''}</p>
                            <p class="text-[11px] text-slate-500 mt-1">
                              {#if m.roles?.includes('kitchen') && m.roles?.includes('hall')}
                                🍳厨房 / 🛎ホール
                              {:else if m.roles?.includes('kitchen')}
                                🍳キッチン
                              {:else}
                                🛎ホール
                              {/if}
                              {#if m.status === 'trainee'}
                                ・ 🔰研修中
                              {/if}
                            </p>
                          </div>
                        </div>
                        <span class="material-symbols-outlined text-slate-400 text-base transition-transform duration-200 {selectedQuickLoginMember?.id === m.id ? 'rotate-90' : ''}" style="font-size: 18px;">arrow_forward_ios</span>
                      </button>

                      <!-- インライン・パスコード入力欄 (アコーディオン展開) -->
                      {#if selectedQuickLoginMember?.id === m.id}
                        <div class="px-4 pb-4 border-t border-slate-100 bg-slate-50/50 space-y-3" in:fade={{ duration: 150 }}>
                          <div class="flex flex-col gap-1 mt-2">
                            <label for="quick-pass-{m.id}" class="text-[10px] font-bold text-slate-500 ml-1">パスコードを入力してください</label>
                            <div class="flex gap-2">
                              <input
                                id="quick-pass-{m.id}"
                                type="password"
                                pattern="[0-9]*"
                                inputmode="numeric"
                                maxlength="4"
                                bind:value={quickLoginPasscode}
                                placeholder="••••"
                                class="flex-grow px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bc1]/20 focus:border-[#005bc1] text-center text-sm tracking-widest font-black text-slate-800 outline-none transition-all"
                                on:keydown={(e) => e.key === 'Enter' && handleQuickLoginSubmit()}
                              />
                              <button
                                type="button"
                                on:click={handleQuickLoginSubmit}
                                class="px-4 bg-[#005bc1] text-white rounded-xl font-bold text-xs hover:opacity-90 active:scale-[0.97] transition-all border-0 cursor-pointer"
                              >
                                送信
                              </button>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                  {#if members.filter(m => m.isActive !== false).length === 0}
                    <p class="text-xs text-slate-400 text-center py-8">
                      登録済みのスタッフはいません。<br />「新規登録」を選択して登録してください。
                    </p>
                  {/if}
                </div>
              </div>

              <div class="relative flex items-center gap-4 py-2">
                <div class="flex-grow border-t border-slate-200"></div>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">または IDでログイン</span>
                <div class="flex-grow border-t border-slate-200"></div>
              </div>

              <div class="space-y-4">
                <div class="flex flex-col gap-1.5">
                  <label for="login-staff-id" class="text-xs font-bold text-slate-700 ml-1">スタッフID</label>
                  <input
                    id="login-staff-id"
                    type="text"
                    bind:value={loginStaffIdInput}
                    placeholder="TN-00000"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bc1]/20 focus:border-[#005bc1] text-sm text-slate-800 outline-none transition-all"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for="login-password" class="text-xs font-bold text-slate-700 ml-1">パスワード（暗証番号）</label>
                  <input
                    id="login-password"
                    type="password"
                    pattern="[0-9]*"
                    inputmode="numeric"
                    maxlength="4"
                    bind:value={loginPasswordInput}
                    placeholder="••••"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bc1]/20 focus:border-[#005bc1] text-sm text-slate-800 outline-none transition-all"
                    on:keydown={(e) => e.key === 'Enter' && handleIdLogin()}
                  />
                </div>
                <button
                  type="button"
                  on:click={handleIdLogin}
                  class="w-full py-4 bg-[#005bc1] text-white rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all border-0 cursor-pointer flex items-center justify-center"
                >
                  ログイン
                </button>
              </div>
            </div>
          {:else}
            <!-- Register Content -->
            <div class="p-6 space-y-5" in:fade={{ duration: 150 }}>
              <div class="p-4 bg-[#005bc1]/10 rounded-2xl flex gap-3 items-start border border-[#005bc1]/5">
                <span class="material-symbols-outlined text-[#005bc1]" style="font-size: 20px;">info</span>
                <p class="text-xs text-[#005bc1] leading-relaxed font-semibold">
                  新規登録には、店舗管理者が発行した「招待コード」（佐藤・鈴木用 8929 / 一般スタッフ用 8888）が必要です。
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="reg-invite-code" class="text-xs font-bold text-slate-700 ml-1">招待コード</label>
                <input
                  id="reg-invite-code"
                  type="text"
                  bind:value={regInviteCode}
                  placeholder="XXXX-XXXX"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bc1]/20 focus:border-[#005bc1] text-center tracking-widest font-bold text-sm text-slate-800 outline-none transition-all"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="reg-invite-name" class="text-xs font-bold text-slate-700 ml-1">お名前</label>
                <input
                  id="reg-invite-name"
                  type="text"
                  bind:value={regInviteName}
                  placeholder="例：桃牛 太郎"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bc1]/20 focus:border-[#005bc1] text-sm text-slate-800 outline-none transition-all"
                />
              </div>

              <!-- 利便性のための追加オプション (役割トグル) -->
              <div class="flex flex-col gap-1.5 pt-2">
                <span class="text-xs font-bold text-slate-700 ml-1">担当タグ (役割)</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    on:click={() => {
                      if (regRoles.includes("kitchen")) {
                        regRoles = regRoles.filter((r) => r !== "kitchen");
                      } else {
                        regRoles = [...regRoles, "kitchen"];
                      }
                    }}
                    class="flex-1 py-3 px-4 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer {regRoles.includes('kitchen') ? 'bg-[#005bc1]/10 border-[#005bc1] text-[#005bc1]' : 'bg-slate-50 border-slate-200 text-slate-500'}"
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
                    class="flex-1 py-3 px-4 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer {regRoles.includes('hall') ? 'bg-[#005bc1]/10 border-[#005bc1] text-[#005bc1]' : 'bg-slate-50 border-slate-200 text-slate-500'}"
                  >
                    <span>🛎</span> ホール
                  </button>
                </div>
              </div>

              <!-- 研修生トグル -->
              <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 mt-1">
                <span class="text-xs font-bold text-slate-700">研修中（トレーニング中）</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" bind:checked={regIsTrainee} class="sr-only peer" />
                  <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:height-4 after:h-4 after:w-4 after:transition-all peer-checked:bg-[#005bc1]"></div>
                </label>
              </div>

              <button
                type="button"
                on:click={handleInviteRegister}
                disabled={isRegistering}
                class="w-full py-4 bg-[#005bc1] text-white rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all border-0 cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                {#if isRegistering}
                  <span class="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>登録処理中...</span>
                {:else}
                  <span>アカウント作成を開始</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- ========================================================================= -->
      <!-- 【メイン画面】シフト表・カレンダー (Apple Store風 7列月間カレンダー)             -->
      <!-- ========================================================================= -->
      {#if activeTab === "calendar"}
        <div class="space-y-6" in:fade={{ duration: 150 }}>
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
                  {#each GRID_CELLS_MONTH as d}
                    {@const isRegularClosed = d.isRegularClosed}
                    {@const isSpecialClosed = specialHolidays.includes(
                      d.dateStr,
                    )}
                    {@const isClosed = isRegularClosed || isSpecialClosed}
                    {@const cellDayNum = Number(d.dateStr.split("-")[2])}
                    {@const cellPeriodHalf = cellDayNum <= 15 ? 'A' : 'B'}
                    {@const cellStatus = cellPeriodHalf === 'A' ? shiftStatusA : shiftStatusB}
                    {@const isCellPublished = cellStatus === 'published'}
                    {@const isVisibleToUser = currentUser?.isAdmin || isCellPublished}
                    {@const allShifts = shifts.filter(
                      (s) => s.date === d.dateStr,
                    ).filter(s => {
                      if (isCellPublished) return true;
                      const m = members.find(mem => mem.id === s.member_id);
                      return m ? m.isActive !== false : true;
                    })}
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
                        if (!isVisibleToUser) return;
                        selectedEditDate = d.dateStr;
                      }}
                      class="glass-panel p-4 min-h-[160px] flex flex-col justify-between relative bg-white {d.isOtherMonth
                        ? 'other-month-cell'
                        : ''} {isClosed && !d.isOtherMonth
                        ? 'opacity-40 bg-slate-50 border-dashed shadow-none cursor-pointer'
                        : ''} {!isVisibleToUser && !d.isOtherMonth ? 'cursor-not-allowed' : 'cursor-pointer'}"
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
                          {:else if !isVisibleToUser}
                            <div class="flex flex-col items-center justify-center min-h-[60px] py-2">
                              <span class="text-xs text-amber-500 font-extrabold flex items-center gap-1 animate-pulse">
                                調整中 ⏰
                              </span>
                            </div>
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

          {#if deadlineInfo}
            <div class="glass-panel p-6 border-l-4 transition-all duration-300 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.03)] {deadlineInfo.type === 'warning'
              ? 'border-l-rose-500 border-y border-r border-rose-100'
              : 'border-l-[#0071e3] border-y border-r border-slate-100'}"
            >
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm {deadlineInfo.type === 'warning' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-blue-50 text-[#0071e3] border border-blue-100'}">
                    {#if deadlineInfo.type === 'warning'}
                      <span class="text-2xl select-none">⚠️</span>
                    {:else}
                      <span class="text-2xl select-none">📅</span>
                    {/if}
                  </div>
                  <div>
                    <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {deadlineInfo.title}
                    </h4>
                    <p class="text-xs md:text-sm font-bold text-slate-500 mt-1">
                      {deadlineInfo.mainLabel}
                    </p>
                    <p class="text-xl md:text-2xl font-black tracking-tight mt-1.5 {deadlineInfo.type === 'warning' ? 'text-rose-600' : 'text-slate-900'}">
                      {deadlineInfo.value}
                    </p>
                  </div>
                </div>

                <div class="max-w-md bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
                  <p class="text-xs md:text-xs font-semibold leading-relaxed {deadlineInfo.type === 'warning' ? 'text-rose-700' : 'text-slate-600'}">
                    {deadlineInfo.description}
                  </p>
                </div>
              </div>
            </div>
          {/if}

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

              <!-- 未入力日のデフォルト設定切替 (UX磨き上げ) -->
              <div class="flex flex-col items-end gap-1.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">未入力日のデフォルト設定</span>
                <div class="flex bg-slate-100 border border-slate-200/60 p-1 rounded-2xl gap-1 w-[220px]">
                  <button
                    type="button"
                    on:click={() => handlePatternSwitch("A")}
                    class="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer {submitPattern === 'A' ? 'bg-white text-[#005bc1] shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}"
                    disabled={isLocked}
                  >
                    出勤可能
                  </button>
                  <button
                    type="button"
                    on:click={() => handlePatternSwitch("B")}
                    class="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer {submitPattern === 'B' ? 'bg-white text-[#005bc1] shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}"
                    disabled={isLocked}
                  >
                    休み希望
                  </button>
                </div>
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
                          <span class="hope-status-badge badge-none opacity-60"
                            >出勤可能</span
                          >
                        {/if}
                      {:else if currentPattern === "B"}
                        {#if isAvail}
                          <span class="hope-status-badge badge-on"
                            >出勤可能</span
                          >
                        {:else}
                          <span class="hope-status-badge badge-none opacity-60"
                            >休み希望</span
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
                  {#if isPastDeadline}
                    <!-- 締め切り後 ➔ ロック状態 -->
                    <div
                      class="w-full glass-panel p-5 border border-slate-200/60 bg-slate-50/60 rounded-3xl flex flex-col items-center gap-2 text-center shadow-sm"
                    >
                      <span
                        class="text-xs font-bold text-slate-500 flex items-center gap-1.5"
                      >
                        🔒 希望シフトの提出・編集は締め切られました
                      </span>
                      <span
                        class="text-[10px] text-slate-400 leading-relaxed font-semibold"
                      >
                        提出締め切り日時 ({deadlineObj ? deadlineObj.toLocaleString() : ""})
                        を過ぎたため、閲覧のみとなっております。遅刻・変更などは店長へ直接ご連絡ください。
                      </span>
                    </div>
                  {:else}
                    <!-- 締め切り前 ➔ 通常提出状態 -->
                    <div
                      class="w-full glass-panel p-5 border border-slate-200/60 bg-white rounded-3xl flex flex-col items-center gap-3 text-center shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <div
                        class="flex items-center gap-2 text-xs font-bold text-slate-800"
                      >
                        {#if isAutoSaving || hasPendingChanges}
                          <span
                            class="w-4 h-4 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin"
                          ></span>
                          <span class="text-[#0071e3]"
                            >希望の変更を下書き保存中...</span
                          >
                        {:else if isSubmitted}
                          <span class="relative flex h-2.5 w-2.5">
                            <span
                              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                            ></span>
                            <span
                              class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"
                            ></span>
                          </span>
                          <span class="text-emerald-600 font-extrabold"
                            >✅ 希望シフト提出済み</span
                          >
                        {:else}
                          <span class="relative flex h-2.5 w-2.5">
                            <span
                              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"
                            ></span>
                            <span
                              class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"
                            ></span>
                          </span>
                          <span class="text-amber-600 font-extrabold"
                            >⚠️ 下書き保存中（未提出です）</span
                          >
                        {/if}
                      </div>
                      <span
                        class="text-[10px] text-slate-400 leading-relaxed font-semibold"
                      >
                        {#if isSubmitted}
                          ※期限前であれば、タップしてカレンダーを変更後、再提出が可能です。
                        {:else}
                          ※カレンダー変更後は自動で下書き保存されますが、必ず下の「確定提出」ボタンを押して完了させてください。
                        {/if}
                      </span>
                      <button
                        type="button"
                        on:click={handleExplicitSubmit}
                        disabled={isSubmittingShift}
                        class="w-full py-3 transition-all flex items-center justify-center gap-2 text-xs font-bold rounded-2xl cursor-pointer border-0 active:scale-[0.99] {isSubmitted ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200' : 'bg-[#0071e3] hover:bg-[#0077f3] text-white shadow-[0_4px_12px_rgba(0,113,227,0.2)]'}"
                      >
                        {isSubmitted ? "提出内容を更新（再提出）" : "希望シフトを確定提出する"}
                      </button>
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
                    提出リマインドをプッシュ配信
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
                    ).filter(s => {
                      if (shiftStatus === "published") return true;
                      const m = members.find(mem => mem.id === s.member_id);
                      return m ? m.isActive !== false : true;
                    })}
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

              <!-- メンバー管理 (退職・復職) -->
              <div class="glass-panel p-6 space-y-4 bg-white mt-6">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 tracking-tight">
                    スタッフ籍・退職管理
                  </h3>
                  <p class="text-xs text-slate-500 mt-0.5 font-medium">
                    スタッフの在籍状況（アクティブ/退職）を管理します。
                  </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-100">
                  <!-- 有効なメンバー一覧 -->
                  <div class="space-y-2.5">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      在籍中のスタッフ ({members.filter(m => m.isActive !== false).length}名)
                    </span>
                    
                    <div class="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {#each members.filter(m => m.isActive !== false) as m}
                        <div class="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 hover:bg-slate-100/30 transition-all duration-200">
                          <button
                            type="button"
                            on:click={() => openWishPreviewModal(m)}
                            class="flex items-center gap-2.5 min-w-0 flex-1 text-left bg-transparent border-0 cursor-pointer outline-none hover:opacity-85 transition-all p-0"
                            title={`${m.name}さんの希望カレンダーを表示`}
                          >
                            <div class="w-8 h-8 rounded-lg bg-slate-200/70 flex items-center justify-center text-xs font-extrabold text-slate-700 shrink-0 border border-slate-300/40">
                              {m.initialChar || m.name.charAt(0)}
                            </div>
                            <span class="text-sm select-none">{m.emoji}</span>
                            <div class="truncate">
                              <p class="text-xs font-bold text-slate-800 truncate hover:text-[#0071e3] transition-colors">{m.name} 🔍</p>
                              <p class="text-[9px] text-slate-400 font-medium">
                                {#if m.roles?.includes('kitchen') && m.roles?.includes('hall')}
                                  🍳厨 / 🛎ホ
                                {:else if m.roles?.includes('kitchen')}
                                  🍳キッチン
                                {:else}
                                  🛎ホール
                                {/if}
                              </p>
                            </div>
                          </button>
                          <div class="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              on:click={() => toggleAdminPrivilege(m.id, !m.isAdmin)}
                              class="text-[9px] font-extrabold px-2 py-1.5 rounded-lg border transition-all duration-150 {m.isAdmin ? 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'}"
                            >
                              {m.isAdmin ? "👑 管理者" : "一般"}
                            </button>
                            <button
                              on:click={() => toggleMemberActive(m.id, false)}
                              class="text-[9px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1.5 rounded-lg border border-rose-100 hover:border-rose-200 transition-all duration-150"
                            >
                              籍を外す
                            </button>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- 退職メンバーの管理 -->
                  <div class="space-y-2.5 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      退職メンバーの管理 ({members.filter(m => m.isActive === false).length}名)
                    </span>
                    
                    <div class="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {#if members.filter(m => m.isActive === false).length === 0}
                        <p class="text-[10px] text-slate-400 text-center py-8 font-semibold">退職処理されたメンバーはいません。</p>
                      {:else}
                        {#each members.filter(m => m.isActive === false) as m}
                          <div class="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 opacity-75 hover:opacity-100 hover:bg-slate-100/30 transition-all duration-200">
                            <div class="flex items-center gap-2 min-w-0">
                              <span class="text-sm select-none">{m.emoji}</span>
                              <div class="truncate">
                                <p class="text-xs font-bold text-slate-800 truncate line-through">{m.name}</p>
                                <p class="text-[9px] text-slate-400 font-medium">退職済み</p>
                              </div>
                            </div>
                            <button
                              on:click={() => toggleMemberActive(m.id, true)}
                              class="shrink-0 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100 hover:border-emerald-200 transition-all duration-150"
                            >
                              有効に戻す
                            </button>
                          </div>
                        {/each}
                      {/if}
                    </div>
                  </div>
                </div>
              </div>

              <!-- システム・データ管理 -->
              <div class="glass-panel p-6 space-y-4 bg-white mt-6 border border-red-100/50">
                <div>
                  <h3 class="text-sm font-bold text-red-600 tracking-tight flex items-center gap-1.5 select-none">
                    ⚠️ システム管理者機能 (データリセット)
                  </h3>
                  <p class="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                    データベース（全スタッフ籍および全希望シフト）を完全にクリーンリセットします。過去のデータはすべて消去され、デフォルトの管理者（パスコード: 8888）のみが作成されます。
                  </p>
                </div>

                <div class="pt-2">
                  <button
                    type="button"
                    on:click={handleDatabaseReset}
                    class="py-3 px-5 transition-all text-xs font-black rounded-2xl cursor-pointer border bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 shadow-sm active:scale-95"
                  >
                    🚨 データベースを完全にリセットする
                  </button>
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

        {#if currentUser?.isAdmin && activeTab === "manager"}
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
                  {#each members.filter(m => m.isActive !== false) as m}
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

  {#if selectedModalMember}
    <!-- Backdrop overlay -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      on:click={() => (selectedModalMember = null)}
      in:fade={{ duration: 150 }}
      out:fade={{ duration: 150 }}
    >
      <!-- Modal card container -->
      <div
        class="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 animate-popup"
        on:click|stopPropagation
      >
        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3] font-bold border border-[#0071e3]/20 select-none">
              {selectedModalMember.initialChar || selectedModalMember.name.charAt(0)}
            </div>
            <div class="text-left">
              <h3 class="text-sm font-black text-slate-800 tracking-tight">
                {selectedModalMember.name} さんの希望シフト状況
              </h3>
              <p class="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                対象期間: {currentPeriodLabel}
              </p>
            </div>
          </div>
          <button
            on:click={() => (selectedModalMember = null)}
            class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors border-0 cursor-pointer"
            aria-label="閉じる"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-6">
          <!-- Submission summary status -->
          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-semibold">
            <span class="text-slate-500">提出状況</span>
            <span class="flex items-center gap-1.5 font-bold">
              {#if isModalSubmitted}
                <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                <span class="text-emerald-600">確定提出済み</span>
              {:else}
                <span class="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></span>
                <span class="text-amber-600">下書き保存（未提出）</span>
              {/if}
            </span>
          </div>

          <!-- Calendar Grid -->
          <div class="space-y-3">
            <!-- 曜日ヘッダー -->
            <div class="grid grid-cols-7 gap-2.5 text-center text-[10px] font-black text-slate-400 tracking-widest uppercase">
              {#each CALENDAR_HEADERS as h}
                <div>{h}</div>
              {/each}
            </div>

            <!-- 日付セル -->
            <div class="grid grid-cols-7 gap-2.5">
              {#each modalGridCells as d}
                {@const isRegularClosed = d.isRegularClosed}
                {@const isSpecialClosed = specialHolidays.includes(d.dateStr)}
                {@const isClosed = isRegularClosed || isSpecialClosed}
                {@const isAvail = modalAvailabilities[d.dateStr] !== undefined
                  ? modalAvailabilities[d.dateStr]
                  : modalSubmitPattern === "A"}
                {@const isNG = !isAvail}
                
                <div class="aspect-square rounded-xl border flex flex-col justify-between p-2 select-none relative transition-all duration-200 {d.isOtherMonth
                  ? 'bg-slate-50/50 border-slate-100 text-slate-300'
                  : isClosed
                    ? 'bg-slate-100/60 border-slate-200 text-slate-400 font-bold'
                    : isNG
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 shadow-sm'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-sm'}"
                >
                  <!-- 日付数値 -->
                  <span class="text-xs font-bold leading-none">{d.dayNum}</span>

                  <!-- 希望状況ステータスラベル -->
                  <div class="text-center w-full pb-0.5">
                    {#if d.isOtherMonth}
                      <!-- なし -->
                    {:else if isClosed}
                      <span class="text-[9px] font-black text-slate-400">定休</span>
                    {:else if isNG}
                      <span class="text-[9px] font-black text-rose-600 block">❌ 休み</span>
                    {:else}
                      <span class="text-[9px] font-black text-emerald-600 block">🟢 出勤</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-end">
          <button
            on:click={() => (selectedModalMember = null)}
            class="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors border-0 cursor-pointer active:scale-95"
          >
            閉じる
          </button>
        </div>
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
