<script>
  // @ts-nocheck

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
   * @property {boolean} [isTrainee]
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
    const jstDate = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
    );
    return `${jstDate.getFullYear()}-${String(jstDate.getMonth() + 1).padStart(2, "0")}`;
  }

  function getSubmissionPeriod(now = new Date()) {
    const jstDate = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
    );
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
    const jstDate = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
    );
    const currentYear = jstDate.getFullYear();
    const currentMonthNum = jstDate.getMonth() + 1;

    if (half === "B") {
      const isSameMonth = currentYear === year && currentMonthNum === month;
      const deadlineDate = new Date(year, month - 1, 10, 23, 59, 59);
      const isPast = jstDate > deadlineDate;

      if (isPast) {
        return {
          type: "warning",
          title: `${month}月後半シフト希望提出`,
          mainLabel: "⚠️ 提出期限を過ぎています！",
          value: `${month}月10日 23:59 締切`,
          description:
            "期限を過ぎたため、本アプリからの提出や変更はロックされています。シフト希望がある場合は、店長のLINE宛てに直接メッセージを送信してください。",
        };
      } else {
        return {
          type: "normal",
          title: `${month}月後半シフト希望提出`,
          mainLabel: "📅 シフト希望提出締め切り日時",
          value: `${month}月10日 23:59 まで`,
          description:
            "※期限厳守でのご提出をお願いいたします。締め切り後は変更ができなくなりますのでご注意ください。",
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
          description:
            "期限を過ぎたため、本アプリからの提出や変更はロックされています。シフト希望がある場合は、店長のLINE宛てに直接メッセージを送信してください。",
        };
      } else {
        return {
          type: "normal",
          title: `${month}月前半シフト希望提出`,
          mainLabel: "📅 シフト希望提出締め切り日時",
          value: `${prevMonth}月25日 23:59 まで`,
          description:
            "※期限厳守でのご提出をお願いいたします。締め切り後は変更ができなくなりますのでご注意ください。",
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
  let managerStaffTab = "active";
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
    const matched = selectablePeriods.find((p) => p.value === currentPeriod);
    return matched ? matched.label : currentPeriod;
  })();

  $: modalAvailabilities = (() => {
    const member = selectedModalMember;
    if (!member) return {};
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    if (currentPeriod.length === 7) {
      const subA = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === `${baseMonth}-A`,
      );
      const subB = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === `${baseMonth}-B`,
      );
      return {
        ...(subA?.availabilities || {}),
        ...(subB?.availabilities || {}),
      };
    } else {
      const sub = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === currentPeriod,
      );
      return sub?.availabilities || {};
    }
  })();

  $: modalSubmitPattern = (() => {
    const member = selectedModalMember;
    if (!member) return "A";
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    const sub = allSubmissions.find(
      (s) => s.staffId === memberId && s.period.startsWith(baseMonth),
    );
    return sub?.submitPattern || "A";
  })();

  $: isModalSubmitted = (() => {
    const member = selectedModalMember;
    if (!member) return false;
    const memberId = member.id;
    const baseMonth = currentPeriod.substring(0, 7);
    if (currentPeriod.length === 7) {
      const subA = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === `${baseMonth}-A`,
      );
      const subB = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === `${baseMonth}-B`,
      );
      return subA?.isSubmitted === true && subB?.isSubmitted === true;
    } else {
      const sub = allSubmissions.find(
        (s) => s.staffId === memberId && s.period === currentPeriod,
      );
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

  /** @type {number[]} */
  let myDeviceUserIds = [];
  try {
    myDeviceUserIds = JSON.parse(
      localStorage.getItem("myDeviceUserIds") || "[]",
    );
  } catch (e) {
    console.error(e);
  }

  // シフト表カレンダー用（モバイル特化UI統合）
  let selectedCalendarDate = "";

  // リアクティブに初期選択日を設定（今日、または最初の日付）
  $: if (
    GRID_CELLS_MONTH &&
    GRID_CELLS_MONTH.length > 0 &&
    !selectedCalendarDate
  ) {
    const todayStr = new Date().toISOString().split("T")[0];
    const hasToday = GRID_CELLS_MONTH.some(
      (d) => d.dateStr === todayStr && !d.isOtherMonth,
    );
    if (hasToday) {
      selectedCalendarDate = todayStr;
    } else {
      const firstValid = GRID_CELLS_MONTH.find((d) => !d.isOtherMonth);
      if (firstValid) {
        selectedCalendarDate = firstValid.dateStr;
      }
    }
  }

  // 選択された日付のパブリッシュ（公開）状況をリアクティブに判定
  $: isSelectedDatePublished = (() => {
    if (!selectedCalendarDate) return false;
    const cellDayNum = Number(selectedCalendarDate.split("-")[2]);
    const cellPeriodHalf = cellDayNum <= 15 ? "A" : "B";
    const cellStatus = cellPeriodHalf === "A" ? shiftStatusA : shiftStatusB;
    return cellStatus === "published";
  })();

  // 選択日におけるアサインシフト一覧
  $: selectedDayShifts = shifts.filter((s) => s.date === selectedCalendarDate);
  $: mySelectedShift = (() => {
    if (!currentUser) return null;
    const currentUserId = currentUser.id;
    return selectedDayShifts.find((s) => s.member_id === currentUserId);
  })();
  $: coworkersSelectedShifts = (() => {
    if (!currentUser) return selectedDayShifts;
    const currentUserId = currentUser.id;
    return selectedDayShifts.filter((s) => s.member_id !== currentUserId);
  })();

  function handlePrevPeriod() {
    const idx = selectablePeriods.findIndex((p) => p.value === currentPeriod);
    if (idx > 0) {
      currentPeriod = selectablePeriods[idx - 1].value;
      selectedCalendarDate = "";
    }
  }

  function handleNextPeriod() {
    const idx = selectablePeriods.findIndex((p) => p.value === currentPeriod);
    if (idx !== -1 && idx < selectablePeriods.length - 1) {
      currentPeriod = selectablePeriods[idx + 1].value;
      selectedCalendarDate = "";
    }
  }

  /**
   * @param {number} userId
   */
  function saveDeviceUser(userId) {
    try {
      /** @type {number[]} */
      let ids = JSON.parse(localStorage.getItem("myDeviceUserIds") || "[]");
      if (!ids.includes(userId)) {
        ids.push(userId);
        localStorage.setItem("myDeviceUserIds", JSON.stringify(ids));
      }
      myDeviceUserIds = ids;
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * @param {Member} member
   */
  async function handleQuickLoginSelect(member) {
    const registeredUser = {
      ...member,
      avatar: member.emoji || (member.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!member.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    saveDeviceUser(registeredUser.id);
    triggerToast(
      `💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`,
    );

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    selectedQuickLoginMember = null;
    quickLoginPasscode = "";
  }

  // 管理者設定ダッシュボード用（動的充足率 ＆ 警告アラート）
  $: firstAlertDate = Object.keys(validationResults).find(
    (date) =>
      !validationResults[date].isValid && !specialHolidays.includes(date),
  );
  $: firstAlertMsg = firstAlertDate
    ? validationResults[firstAlertDate].message
    : null;

  $: averageFillRate = (() => {
    if (!GRID_CELLS || GRID_CELLS.length === 0) return 100;
    const validCells = GRID_CELLS.filter(
      (d) =>
        !d.isOtherMonth &&
        !d.isRegularClosed &&
        !specialHolidays.includes(d.dateStr),
    );
    if (validCells.length === 0) return 100;
    let total = 0;
    validCells.forEach((d) => {
      const dayShifts = shifts.filter((s) => s.date === d.dateStr);
      const targetCount = d.isWeekend ? 6 : 4;
      total += Math.min(
        100,
        Math.round((dayShifts.length / targetCount) * 100),
      );
    });
    return Math.round(total / validCells.length);
  })();

  $: if (members && members.filter((m) => m.isActive !== false).length === 0) {
    loginScreenMode = "register";
  }

  /**
   * @param {Member} member
   */
  async function handleSelectStaffLogin(member) {
    const registeredUser = {
      ...member,
      avatar: member.emoji || (member.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!member.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    triggerToast(
      `💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`,
    );

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    loginPasscode = "";
  }

  // --- 新ログイン/登録処理ロジック (UXリファイン統合) ---
  async function handleIdLogin() {
    const idStr = loginStaffIdInput.trim();

    if (!idStr) {
      triggerToast("⚠️ スタッフIDを入力してください。");
      return;
    }

    const match = idStr.match(/\d+/);
    if (!match) {
      triggerToast("⚠️ 正しいスタッフID（例: TN-00005）を入力してください。");
      return;
    }
    const idNum = parseInt(match[0], 10);

    const member = members.find(
      (m) => Number(m.id) === idNum && m.isActive !== false,
    );
    if (!member) {
      triggerToast("⚠️ 該当するスタッフが見つかりません。");
      return;
    }

    const registeredUser = {
      ...member,
      avatar: member.emoji || (member.roles?.includes("kitchen") ? "👨‍🍳" : "👩‍💼"),
      isAdmin: !!member.isAdmin,
    };
    currentUser = registeredUser;

    localStorage.setItem("currentUser", JSON.stringify(registeredUser));
    triggerToast(
      `💚 ログインしました！おかえりなさい、${registeredUser.name}さん。`,
    );

    selectedStaffId = registeredUser.id;
    await loadStaffSubmissions(registeredUser.id);
    requestPushSubscription(registeredUser.id).catch(console.error);

    loginStaffIdInput = "";
    loginPasswordInput = "";
  }

  async function handleInviteRegister() {
    const name = regInviteName.trim();
    const initial = regInitialChar.trim();

    if (!name) {
      triggerToast("⚠️ お名前を入力してください。");
      return;
    }

    if (!initial) {
      triggerToast("⚠️ シフト表示用の1文字を入力してください。");
      return;
    }

    if (initial.length !== 1) {
      triggerToast("⚠️ シフト表示用文字は1文字のみ指定してください。");
      return;
    }

    // 既存アクティブメンバーとイニシャル被りチェック
    const isDuplicate = members.some(
      (m) => m.isActive !== false && m.initialChar === initial,
    );
    if (isDuplicate) {
      triggerToast(
        `⚠️ 「${initial}」は既に他のスタッフが使用しています。別の文字を指定してください。`,
      );
      return;
    }

    isRegistering = true;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          initialChar: initial,
          roles: regRoles && regRoles.length ? regRoles : ["hall"],
          status: regIsTrainee ? "trainee" : "regular",
          passcode: "",
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
        saveDeviceUser(registeredUser.id);
        triggerToast(
          `💚 登録が完了しました！${registeredUser.name}さん、歓迎します。スタッフID: TN-${String(registeredUser.id).padStart(5, "0")}`,
        );

        regInviteCode = "";
        regInviteName = "";
        regInitialChar = "";
        regPasscode = "";
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
    // クイックログイン時に直接ログインするため、この関数は不要ですが、互換性維持のため空関数として残すか廃止します
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

        const mName =
          members.find((m) => m.id === memberId)?.name || "スタッフ";
        triggerToast(
          isAdmin
            ? `👑 ${mName}さんに管理者権限を付与しました。`
            : `👤 ${mName}さんの管理者権限を剥奪しました。`,
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
    const ok = confirm(
      "🚨 警告: データベース（全スタッフ、全希望データ）を完全にリセットします。よろしいですか？",
    );
    if (!ok) return;

    const finalOk = confirm(
      "⚠️ 本当に実行しますか？この操作は絶対に元に戻せません！",
    );
    if (!finalOk) return;

    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
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

  $: selectablePeriods =
    activeTab === "calendar"
      ? [
          { value: "2026-06", label: "2026年6月" },
          { value: "2026-07", label: "2026年7月" },
          { value: "2026-08", label: "2026年8月" },
        ]
      : [
          { value: "2026-06-A", label: "2026年6月 前半 (1日〜15日) " },
          { value: "2026-06-B", label: "2026年6月 後半 (16日〜末日)" },
          { value: "2026-07-A", label: "2026年7月 前半 (1日〜15日)" },
          { value: "2026-07-B", label: "2026年7月 後半 (16日〜末日)" },
          { value: "2026-08-A", label: "2026年8月 前半 (1日〜15日)" },
          { value: "2026-08-B", label: "2026年8月 後半 (16日〜末日)" },
        ];

  $: deadlineInfo = getDeadlineInfo(currentPeriod);

  $: deadlineObj = getDeadlineDateForPeriod(currentPeriod);
  $: isPastDeadline = deadlineObj ? new Date() > deadlineObj : false;
  $: mySubmission = allSubmissions.find(
    (sub) =>
      sub.period === currentPeriod &&
      Number(sub.staffId) === Number(currentUser?.id),
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

  $: isAllShiftsValid = DATES.every(
    (d) => validationResults[d.dateStr]?.isValid !== false,
  );
  $: submittedStaffIds = new Set(
    allSubmissions
      .filter((sub) => sub.period === currentPeriod)
      .map((sub) => Number(sub.staffId)),
  );
  $: unsubmittedMembers = members.filter(
    (m) => m.isActive !== false && !submittedStaffIds.has(Number(m.id)),
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
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("[Push] このブラウザは通知をサポートしていません。");
      pushPermissionStatus = "denied";
      return;
    }

    if (Notification.permission === "default") {
      pushPermissionStatus = "requesting";
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.info("[Push] 通知許可が得られませんでした。");
        pushPermissionStatus = "denied";
        return;
      }

      pushPermissionStatus = "granted";

      const registration = await navigator.serviceWorker.ready;

      // 既存の購読が残っていた場合は一旦解除してクリーンに再登録する
      // (applicationServerKey が変わると InvalidStateError が発生するため)
      const existingSubscription =
        await registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.info("[Push] 既存の購読を解除してクリーン再登録します...");
        await existingSubscription.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      console.info("[Push] 購読成功:", subscription.endpoint);

      const res = await fetch("/api/auth/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          subscription,
        }),
      });

      if (res.ok) {
        triggerToast("🔔 プッシュ通知の設定が完了しました！");
      } else {
        console.error(
          "プッシュ購読情報の保存に失敗しました:",
          await res.text(),
        );
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
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

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
    if (
      !cleanPasscode ||
      cleanPasscode.length !== 4 ||
      !/^\d{4}$/.test(cleanPasscode)
    ) {
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
          passcode: cleanPasscode,
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
        saveDeviceUser(registeredUser.id);
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
            const freshMember = members.find((m) => m.id === parsedUser.id);
            if (freshMember) {
              const refreshedUser = {
                ...parsedUser,
                ...freshMember,
                avatar: parsedUser.avatar || freshMember.emoji || "👩‍💼",
                isAdmin: !!freshMember.isAdmin,
              };
              currentUser = refreshedUser;
              // キャッシュを最新データで上書き
              localStorage.setItem(
                "currentUser",
                JSON.stringify(refreshedUser),
              );
            } else {
              // メンバーリストに存在しなくなった場合はキャッシュをクリア
              console.warn(
                "[App] Cached user not found in members. Clearing session.",
              );
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
      if (typeof window !== "undefined" && "Notification" in window) {
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

  $: deficitDates = DATES.filter((d) => {
    const isClosed = d.isRegularClosed || specialHolidays.includes(d.dateStr);
    if (isClosed) return false;
    return !validationResults[d.dateStr]?.isValid;
  }).map((d) => {
    const dateStr = d.dateStr;
    const todayShifts = shifts.filter((s) => s.date === dateStr);
    const kitchenCount = todayShifts.filter((s) => s.role === "kitchen").length;
    const hallCount = todayShifts.filter((s) => s.role === "hall").length;

    // 研修生のチェック
    const traineeStaff = todayShifts.filter((s) => {
      const m = members.find((mem) => mem.id === s.member_id);
      return m && m.status === "trainee";
    });
    const hasTrainee = traineeStaff.length > 0;
    const requiredTotal = hasTrainee ? 3 : 2;
    const totalCount = todayShifts.length;

    let deficitReason = "";
    if (kitchenCount < 1 && hallCount < 1) {
      deficitReason = "🍳 厨房・🛎 ホール不足";
    } else if (kitchenCount < 1) {
      deficitReason = "🍳 キッチン不足 1名";
    } else if (hallCount < 1) {
      deficitReason = "🙋‍♂️ ホール不足 1名";
    } else if (totalCount < requiredTotal) {
      deficitReason = `👥 人数不足 ${requiredTotal - totalCount}名`;
    } else {
      deficitReason = validationResults[dateStr]?.message || "要確認";
    }

    // 表示用のフォーマット: "7月18日(土)"
    const dateParts = dateStr.split("-");
    const monthNum = Number(dateParts[1]);
    const dayNum = Number(dateParts[2]);
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][
      new Date(dateStr + "T00:00:00").getDay()
    ];
    const dateLabel = `${monthNum}月${dayNum}日(${dayOfWeek})`;

    return {
      dateStr,
      dateLabel,
      reason: deficitReason,
      isKitchenDeficit: kitchenCount < 1,
      isHallDeficit: hallCount < 1 && kitchenCount >= 1,
    };
  });

  $: isVisibleA = currentUser?.isAdmin || shiftStatusA === "published";
  $: isVisibleB = currentUser?.isAdmin || shiftStatusB === "published";

  $: memberAssignedStats = members
    .map((m) => {
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
    })
    .filter(
      (m) =>
        m.isActive !== false || (shiftStatus === "published" && m.count > 0),
    );

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
        }),
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

        const mName =
          members.find((m) => m.id === memberId)?.name || "スタッフ";
        triggerToast(
          isActive
            ? `💚 ${mName}さんを有効（復職）に戻しました。`
            : `📁 ${mName}さんを退職処理（非表示）にしました。`,
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

  /**
   * @param {number} memberId
   */
  async function deleteMember(memberId) {
    try {
      const res = await fetch("/api/members/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId }),
      });
      if (res.ok) {
        const mName =
          members.find((m) => m.id === memberId)?.name || "スタッフ";
        members = members.filter((m) => m.id !== memberId);
        triggerToast(`🗑️ ${mName}さんのデータを完全に削除しました。`);
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("メンバーの削除に失敗しました:", err);
      triggerToast(`⚠️ 削除失敗: ${err.message}`);
    }
  }

  /**
   * @param {number} memberId
   * @param {string[]} newRoles
   */
  async function updateMemberRoles(memberId, newRoles) {
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, roles: newRoles }),
      });
      if (res.ok) {
        members = members.map((m) => {
          if (m.id === memberId) {
            return { ...m, roles: newRoles, role: newRoles[0] || "hall" };
          }
          return m;
        });
        triggerToast("🍳 役割設定を更新しました。");
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 役割の更新に失敗しました: ${err.message}`);
    }
  }

  /**
   * @param {number} memberId
   * @param {string} newPasscode
   */
  async function updateMemberPasscode(memberId, newPasscode) {
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, passcode: newPasscode }),
      });
      if (res.ok) {
        members = members.map((m) => {
          if (m.id === memberId) {
            return { ...m, passcode: newPasscode };
          }
          return m;
        });
        triggerToast("🔑 暗証番号（パスコード）を更新しました。");
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ 暗証番号の更新に失敗しました: ${err.message}`);
    }
  }

  /**
   * @param {number} memberId
   * @param {string} newStatus
   */
  async function updateMemberStatus(memberId, newStatus) {
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, status: newStatus }),
      });
      if (res.ok) {
        members = members.map((m) => {
          if (m.id === memberId) {
            return {
              ...m,
              status: newStatus,
              isTrainee: newStatus === "trainee",
            };
          }
          return m;
        });
        triggerToast(
          `🔰 研修ステータスを ${newStatus === "trainee" ? "研修中" : "一般"} に更新しました。`,
        );
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error(err);
      triggerToast(`⚠️ ステータスの更新に失敗しました: ${err.message}`);
    }
  }

  /**
   * @param {number} memberId
   * @param {boolean} canHappyHour
   */
  async function toggleHappyHourAbility(memberId, canHappyHour) {
    try {
      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, canHappyHour }),
      });
      if (res.ok) {
        members = members.map((m) => {
          if (m.id === memberId) {
            return {
              ...m,
              canHappyHour,
            };
          }
          return m;
        });
        const mName =
          members.find((m) => m.id === memberId)?.name || "スタッフ";
        triggerToast(
          canHappyHour
            ? `🍻 ${mName}さんをハッピーアワー対応可能に設定しました。`
            : `🍻 ${mName}さんをハッピーアワー対応不可に設定しました。`,
        );
      } else {
        throw new Error(await res.text());
      }
    } catch (error) {
      const err = /** @type {any} */ (error);
      console.error("ハッピーアワー対応設定の更新に失敗しました:", err);
      triggerToast(`⚠️ 設定更新失敗: ${err.message}`);
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
      isSubmitted: true, // Mark as explicitly submitted!
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
            on:click={() => {
              if (currentUser) requestPushSubscription(currentUser.id);
            }}
            class="text-[10px] font-bold text-white bg-[#0071e3] hover:bg-[#005bb5] px-3 py-1.5 rounded-lg transition-colors"
          >
            許可する
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if !currentUser}
    <!-- Google Stitch ログイン前ヘッダー -->
    <header
      class="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-white border-b border-slate-200 shadow-sm transition-all duration-300"
    >
      <div class="flex items-center gap-2">
        <span
          class="material-symbols-outlined text-[#005bc1] font-black text-xl"
          >restaurant</span
        >
        <h1 class="text-base font-black text-[#005bc1] tracking-tight">
          桃牛苑
        </h1>
      </div>
      <div class="flex items-center gap-4">
        <button
          class="material-symbols-outlined text-slate-500 hover:opacity-80 transition-opacity bg-transparent border-0 cursor-pointer"
          >notifications</button
        >
        <div
          class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden"
        >
          <span class="material-symbols-outlined text-slate-400 text-sm"
            >person</span
          >
        </div>
      </div>
    </header>
  {:else}
    <!-- Apple Store風セグメントヘッダー (ログイン後) -->
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
        </div>
      </div>
    </header>
  {/if}

  <!-- メインコンテンツ -->
  <main class="max-w-7xl mx-auto px-6 mt-8">
    {#if !currentUser}
      <!-- Google Stitch デザイン完全刷新 ログイン/新規登録ポータル -->
      <div
        class="w-full max-w-[1200px] mx-auto py-8 animate-popup"
        in:fade={{ duration: 250 }}
      >
        <!-- Welcome Hero & Feature Bento Grid -->
        <section class="w-full mb-12">
          <div class="text-center mb-8">
            <h2
              class="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-2"
            >
              スタッフポータルへようこそ
            </h2>
            <p class="text-sm md:text-base text-slate-500 font-medium">
              桃牛苑の業務をよりスムーズに、よりシンプルに。
            </p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Feature 1 -->
            <div
              class="bg-white p-6 rounded-[20px] shadow-soft border border-slate-100/80 flex flex-col items-start gap-4"
            >
              <div
                class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
              >
                <span class="material-symbols-outlined">calendar_month</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-800 mb-1">
                  シフト確認
                </h3>
                <p class="text-xs text-slate-500 leading-relaxed">
                  リアルタイムで自分のスケジュールをチェック。店舗の状況も一目で把握できます。
                </p>
              </div>
            </div>
            <!-- Feature 2 -->
            <div
              class="bg-white p-6 rounded-[20px] shadow-soft border border-slate-100/80 flex flex-col items-start gap-4"
            >
              <div
                class="w-12 h-12 rounded-xl bg-tertiary-container/10 text-tertiary flex items-center justify-center"
              >
                <span class="material-symbols-outlined">send</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-800 mb-1">
                  希望提出
                </h3>
                <p class="text-xs text-slate-500 leading-relaxed">
                  休暇や希望シフトの提出もアプリから。調整結果もすぐにプッシュ通知で届きます。
                </p>
              </div>
            </div>
            <!-- Feature 3 -->
            <div
              class="bg-white p-6 rounded-[20px] shadow-soft border border-slate-100/80 flex flex-col items-start gap-4"
            >
              <div
                class="w-12 h-12 rounded-xl bg-error-container/20 text-error flex items-center justify-center"
              >
                <span class="material-symbols-outlined">notifications</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-800 mb-1">
                  重要なお知らせ
                </h3>
                <p class="text-xs text-slate-500 leading-relaxed">
                  店舗からの緊急連絡や、マニュアルの更新などを逃さずキャッチアップ。
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Auth Section -->
        <section
          class="w-full max-w-md mx-auto bg-white rounded-[20px] shadow-soft border border-slate-100 overflow-hidden"
        >
          <!-- Tabs -->
          <div class="flex p-1.5 bg-slate-100 m-5 rounded-2xl">
            <button
              type="button"
              on:click={() => {
                loginScreenMode = "login";
                selectedQuickLoginMember = null;
                quickLoginPasscode = "";
              }}
              class="flex-grow py-3 px-6 rounded-xl font-bold text-xs transition-all border-0 cursor-pointer {loginScreenMode ===
              'login'
                ? 'bg-white text-primary shadow-sm'
                : 'bg-transparent text-secondary hover:bg-slate-100'}"
            >
              スタッフログイン
            </button>
            <button
              type="button"
              on:click={() => {
                loginScreenMode = "register";
              }}
              class="flex-grow py-3 px-6 rounded-xl font-bold text-xs transition-all border-0 cursor-pointer {loginScreenMode ===
              'register'
                ? 'bg-white text-primary shadow-sm'
                : 'bg-transparent text-secondary hover:bg-slate-100'}"
            >
              新規登録
            </button>
          </div>

          <!-- Login Content -->
          {#if loginScreenMode === "login"}
            <div class="px-6 pb-8 space-y-6" in:fade={{ duration: 150 }}>
              <div>
                <p
                  class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4"
                >
                  クイックログイン
                </p>
                <div
                  class="flex flex-col gap-3 max-h-[360px] overflow-y-auto hide-scrollbar p-1"
                >
                  {#each members.filter((m) => m.isActive !== false && myDeviceUserIds.includes(m.id)) as m}
                    {@const isKitchen = m.roles?.includes("kitchen")}
                    {@const isTrainee = m.status === "trainee"}
                    <div
                      class="flex flex-col bg-slate-50 border border-slate-200/50 rounded-xl overflow-hidden transition-all duration-200 hover:border-primary/50"
                    >
                      <button
                        type="button"
                        on:click={() => handleQuickLoginSelect(m)}
                        class="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-all border-0 bg-transparent"
                      >
                        <div class="flex items-center gap-3">
                          <div
                            class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                            {isKitchen
                              ? 'bg-primary-container/10 text-primary'
                              : 'bg-tertiary-container/10 text-tertiary'}"
                          >
                            <span>{m.initialChar || m.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p
                              class="font-bold text-xs text-slate-800 flex items-center gap-1.5"
                            >
                              {m.name}
                              {#if isTrainee}
                                <span
                                  class="bg-amber-100 text-amber-800 text-[8px] px-1 rounded font-black"
                                  >🔰</span
                                >
                              {/if}
                            </p>
                            <p
                              class="text-[10px] text-slate-400 font-medium mt-0.5"
                            >
                              {#if m.roles?.includes("kitchen") && m.roles?.includes("hall")}
                                🍳厨房 / 🛎ホール
                              {:else if m.roles?.includes("kitchen")}
                                🍳キッチン
                              {:else}
                                🛎ホール
                              {/if}
                              {#if m.isAdmin}
                                (管理者)
                              {/if}
                            </p>
                          </div>
                        </div>
                        <span
                          class="material-symbols-outlined text-slate-400 text-sm"
                          >chevron_right</span
                        >
                      </button>
                    </div>
                  {:else}
                    <div
                      class="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200"
                    >
                      <span class="text-3xl block mb-2">👋</span>
                      <p class="text-xs font-bold text-slate-700">
                        この端末でログインした履歴がありません
                      </p>
                      <p class="text-[10px] text-slate-400 font-semibold mt-1">
                        新しく始める方は上の「新規登録」タブから登録してください。
                      </p>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Register Content -->
          {#if loginScreenMode === "register"}
            <div class="px-6 pb-8 space-y-4 mt-2" in:fade={{ duration: 150 }}>
              <div class="space-y-1 flex flex-col">
                <label
                  for="reg-invite-name"
                  class="text-xs font-bold text-slate-700 ml-1">お名前</label
                >
                <input
                  id="reg-invite-name"
                  type="text"
                  bind:value={regInviteName}
                  placeholder="例：桃牛 太郎"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs text-slate-800 outline-none transition-all"
                />
              </div>

              <div class="space-y-1 flex flex-col">
                <label
                  for="reg-initial-char"
                  class="text-xs font-bold text-slate-700 ml-1"
                  >シフト表表示用の1文字</label
                >
                <input
                  id="reg-initial-char"
                  type="text"
                  maxlength="1"
                  bind:value={regInitialChar}
                  placeholder="例：太 (他スタッフと重複不可)"
                  class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs text-slate-800 outline-none transition-all"
                />
              </div>

              <!-- 役割選択 & 研修生フラグ (登録に必須) -->
              <div class="flex flex-col gap-1.5 pt-2">
                <span class="text-xs font-bold text-slate-700 ml-1"
                  >担当タグ (役割)</span
                >
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
                    class="flex-1 py-3 px-4 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-solid
                    {regRoles.includes('kitchen')
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-slate-50 border-slate-200 text-slate-500'}"
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
                    class="flex-1 py-3 px-4 border rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border-solid
                    {regRoles.includes('hall')
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-slate-50 border-slate-200 text-slate-500'}"
                  >
                    <span>🛎</span> ホール
                  </button>
                </div>
              </div>

              <!-- 研修生トグル -->
              <div
                class="flex items-center justify-between border rounded-xl p-4 mt-1 border-solid transition-all duration-200
                {regIsTrainee
                  ? 'bg-amber-50/50 border-amber-300 shadow-sm'
                  : 'bg-slate-50 border-slate-200'}"
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold text-slate-700"
                    >研修中（トレーニング中）</span
                  >
                  {#if regIsTrainee}
                    <span
                      class="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 animate-pulse"
                      >🔰 研修中</span
                    >
                  {:else}
                    <span
                      class="bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      >一般</span
                    >
                  {/if}
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={regIsTrainee}
                    class="sr-only peer"
                  />
                  <div
                    class="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 border-0"
                  ></div>
                </label>
              </div>

              <button
                type="button"
                on:click={handleInviteRegister}
                disabled={isRegistering}
                class="w-full h-[50px] mt-4 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all border-0 cursor-pointer flex items-center justify-center gap-2"
              >
                {#if isRegistering}
                  <span class="material-symbols-outlined animate-spin text-sm"
                    >progress_activity</span
                  >
                  <span>登録処理中...</span>
                {:else}
                  <span>アカウント作成を開始</span>
                {/if}
              </button>
            </div>
          {/if}
        </section>
      </div>
    {:else}
      <!-- ========================================================================= -->
      <!-- 【メイン画面】シフト表・カレンダー (Apple Store風 7列月間カレンダー)             -->
      <!-- ========================================================================= -->
      {#if activeTab === "calendar"}
        <div class="space-y-6" in:fade={{ duration: 150 }}>
          <!-- Date Selector / Month Navigation -->
          <section
            class="flex justify-between items-center bg-white p-4.5 rounded-[20px] shadow-soft border border-slate-100"
          >
            <h2 class="text-xl font-headline-md font-bold text-on-surface">
              {currentPeriod.slice(0, 4)}年 {Number(
                currentPeriod.slice(5, 7),
              )}月
            </h2>
            <div class="flex gap-2">
              <button
                type="button"
                on:click={handlePrevPeriod}
                class="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-soft text-primary hover:text-primary/80 transition-all active:scale-90 border-0 cursor-pointer"
              >
                <span class="material-symbols-outlined">chevron_left</span>
              </button>
              <button
                type="button"
                on:click={handleNextPeriod}
                class="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-soft text-primary hover:text-primary/80 transition-all active:scale-90 border-0 cursor-pointer"
              >
                <span class="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </section>

          <!-- 2カラムレイアウト (PCでの表示もレスポンシブにサポート) -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <!-- 左側: カレンダー (3カラム分) -->
            <div class="lg:col-span-3 space-y-6 min-w-0 w-full overflow-hidden">
              <section
                class="bg-white rounded-[20px] p-3 md:p-6 shadow-soft border border-slate-100"
              >
                <div class="grid grid-cols-7 calendar-grid mb-2">
                  {#each CALENDAR_HEADERS as h}
                    <div
                      class="text-center font-label-caps text-label-caps py-2
                      {h === '土'
                        ? 'text-primary'
                        : h === '日'
                          ? 'text-error'
                          : 'text-secondary'}"
                    >
                      {h}
                    </div>
                  {/each}
                </div>

                <div class="grid grid-cols-7 calendar-grid gap-y-2">
                  {#each GRID_CELLS_MONTH as d}
                    {@const isRegularClosed = d.isRegularClosed}
                    {@const isSpecialClosed = specialHolidays.includes(
                      d.dateStr,
                    )}
                    {@const isClosed = isRegularClosed || isSpecialClosed}
                    {@const cellDayNum = Number(d.dateStr.split("-")[2])}
                    {@const cellPeriodHalf = cellDayNum <= 15 ? "A" : "B"}
                    {@const cellStatus =
                      cellPeriodHalf === "A" ? shiftStatusA : shiftStatusB}
                    {@const isCellPublished = cellStatus === "published"}
                    {@const isVisibleToUser =
                      currentUser?.isAdmin || isCellPublished}

                    {@const dayShifts = shifts
                      .filter((s) => s.date === d.dateStr)
                      .filter((s) => {
                        if (isCellPublished) return true;
                        const m = members.find((mem) => mem.id === s.member_id);
                        return m ? m.isActive !== false : true;
                      })}
                    {@const hasShift = dayShifts.length > 0}
                    {@const isSelected = selectedCalendarDate === d.dateStr}
                    {@const isToday =
                      d.dateStr === new Date().toLocaleDateString("sv-SE")}
                    {@const hasMyShift = !!(
                      currentUser &&
                      dayShifts.some((s) => s.member_id === currentUser?.id)
                    )}

                    <button
                      type="button"
                      on:click={() => {
                        if (d.isOtherMonth) return;
                        selectedCalendarDate = d.dateStr;
                      }}
                      disabled={d.isOtherMonth}
                      class="h-12 flex flex-col items-center justify-center font-body-sm text-body-sm relative cursor-pointer border-0 bg-transparent transition-all active:scale-95 outline-none select-none
                      {d.isOtherMonth ? 'opacity-0 pointer-events-none' : ''}
                      {isSelected
                        ? 'text-white font-bold'
                        : isToday
                          ? 'text-primary font-black scale-105'
                          : 'text-on-surface'}"
                    >
                      <span class="z-10">{d.dayNum}</span>

                      {#if isSelected}
                        <!-- 選択中の青丸背景 (Google Stitch デザイン準拠) -->
                        <div
                          class="absolute inset-0 m-1 bg-primary rounded-full shadow-md z-0"
                        ></div>
                      {:else if !d.isOtherMonth && !isClosed && isVisibleToUser}
                        {#if hasMyShift}
                          <!-- 自分のシフトがある日 (極上のグリーンハイライト) -->
                          <div
                            class="absolute inset-0 m-1 bg-emerald-500/10 rounded-full border border-emerald-500/30 z-0 {isToday
                              ? 'ring-2 ring-primary/40'
                              : ''}"
                          ></div>
                          <div
                            class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-0.5 z-10"
                            title="自分のシフトがあります"
                          ></div>
                        {:else if isToday}
                          <!-- 今日 (シフトなし) -->
                          <div
                            class="absolute inset-0 m-1 bg-transparent rounded-full border-2 border-primary/40 z-0"
                          ></div>
                        {:else if hasShift}
                          <!-- 他人のアサインあり（未選択）：薄い青の丸型輪郭のみ表示（点は表示しない） -->
                          <div
                            class="absolute inset-0 m-1 bg-primary/5 rounded-full border border-primary/10 z-0"
                          ></div>
                        {/if}
                      {/if}

                      <!-- 定休日・臨時休業・調整中のバッジ表示 -->
                      {#if !isSelected}
                        {#if isClosed}
                          <span
                            class="text-[8px] font-bold text-slate-400 absolute bottom-1 z-10"
                          >
                            {isRegularClosed ? "定休" : "臨時"}
                          </span>
                        {:else if !isVisibleToUser}
                          <span
                            class="text-[8px] font-bold text-amber-500 absolute bottom-1 z-10"
                          >
                            調整
                          </span>
                        {/if}
                      {/if}
                    </button>
                  {/each}
                </div>
              </section>
            </div>

            <!-- 右側: 選択日の詳細表示 (1カラム分) -->
            <div class="lg:col-span-1 space-y-6">
              {#if selectedCalendarDate}
                {@const dateObj = new Date(selectedCalendarDate)}
                {@const dayNames = ["日", "月", "火", "水", "木", "金", "土"]}
                {@const formattedDateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${dayNames[dateObj.getDay()]})`}

                <section class="space-y-4">
                  <div class="flex items-center justify-between">
                    <h3
                      class="font-headline-md text-headline-md text-on-surface"
                    >
                      {formattedDateStr}
                    </h3>

                    {#if isSelectedDatePublished}
                      <span
                        class="bg-tertiary-container/10 text-tertiary-container px-3 py-1 rounded-full font-label-badge text-label-badge"
                        >確定済</span
                      >
                    {:else}
                      <span
                        class="bg-error-container/10 text-error px-3 py-1 rounded-full font-label-badge text-label-badge"
                        >調整中</span
                      >
                    {/if}
                  </div>

                  <!-- My Shift Card (自分のシフト) -->
                  <div
                    class="bg-white rounded-[20px] p-md shadow-soft border border-slate-100 border-l-4 border-l-primary"
                  >
                    <div class="flex justify-between items-start mb-sm">
                      <div>
                        <div
                          class="font-label-caps text-label-caps text-secondary uppercase tracking-wider mb-1"
                        >
                          YOUR SHIFT
                        </div>
                        <div
                          class="font-headline-md text-headline-md text-on-surface font-bold"
                        >
                          {#if mySelectedShift}
                            {mySelectedShift.start_time || "17:00"}〜
                          {:else}
                            お休み
                          {/if}
                        </div>
                      </div>
                      <div class="bg-primary/10 text-primary p-2 rounded-xl">
                        <span
                          class="material-symbols-outlined"
                          style="font-variation-settings: 'FILL' 1;"
                          >person_pin</span
                        >
                      </div>
                    </div>

                    {#if mySelectedShift}
                      <div class="flex items-center gap-2 mb-4">
                        <span
                          class="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-md font-label-badge text-label-badge"
                        >
                          {#if mySelectedShift.role === "kitchen"}🍳キッチン{:else}🛎ホール{/if}
                        </span>
                        {#if currentUser?.isAdmin}
                          <span
                            class="bg-primary-container/10 text-primary px-2 py-0.5 rounded-md font-label-badge text-label-badge"
                            >管理者</span
                          >
                        {/if}
                      </div>
                    {/if}

                    <div
                      class="pt-4 border-t border-surface-variant flex items-center justify-between"
                    >
                      <span
                        class="font-body-sm text-body-sm text-secondary font-medium"
                      >
                        {#if mySelectedShift}
                          休憩を含む (実働時間)
                        {:else}
                          希望休・シフトアサインなし
                        {/if}
                      </span>

                      <!-- 管理者の場合のみ「シフト編集」へのショートカットにする -->
                      {#if currentUser?.isAdmin}
                        <button
                          type="button"
                          on:click={() => {
                            selectedEditDate = selectedCalendarDate;
                          }}
                          class="text-primary font-label-badge text-label-badge flex items-center gap-1 active:opacity-50 border-0 bg-transparent cursor-pointer"
                        >
                          シフト編集 <span
                            class="material-symbols-outlined text-xs">edit</span
                          >
                        </button>
                      {/if}
                    </div>
                  </div>

                  <!-- Coworkers List (一緒に出勤するメンバー) -->
                  <div
                    class="bg-white rounded-[20px] p-md shadow-soft border border-slate-100"
                  >
                    <h4
                      class="font-label-caps text-label-caps text-secondary mb-md"
                    >
                      今日出勤するメンバー ({coworkersSelectedShifts.length})
                    </h4>

                    <div
                      class="space-y-4 max-h-[250px] overflow-y-auto pr-1 hide-scrollbar"
                    >
                      {#each coworkersSelectedShifts as s}
                        {@const m = members.find(
                          (mem) => mem.id === s.member_id,
                        )}
                        {@const isTrainee = m?.status === "trainee"}

                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-3">
                            <div
                              class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm"
                            >
                              {getMemberInitial(s.member_name, members)}
                            </div>
                            <div>
                              <div
                                class="font-body-lg text-body-lg text-on-surface font-bold flex items-center gap-1"
                              >
                                <span>{s.member_name}</span>
                                {#if isTrainee}
                                  <span
                                    class="bg-amber-100 text-amber-800 text-[8px] px-1 py-0.2 rounded font-black"
                                    >🔰</span
                                  >
                                {/if}
                              </div>
                              <div
                                class="font-body-sm text-body-sm text-secondary"
                              >
                                {#if s.role === "kitchen"}🍳キッチン{:else}🛎ホール{/if}
                                / {s.start_time || "17:00"}〜
                              </div>
                            </div>
                          </div>
                        </div>
                      {:else}
                        <p
                          class="font-body-sm text-body-sm text-secondary text-center py-6"
                        >
                          同僚のアサインはありません
                        </p>
                      {/each}
                    </div>
                  </div>
                </section>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- ========================================================================= -->
      <!-- 【希望提出画面】スケジュール希望提出 (カレンダー形式タップ選択)              -->
      <!-- ========================================================================= -->
      {#if activeTab === "submissions"}
        <div class="space-y-6" in:fade={{ duration: 150 }}>
          <!-- Submission Deadline Banner -->
          {#if deadlineInfo}
            <div
              class="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 shadow-sm {isPastDeadline
                ? ''
                : 'animate-pulse'}"
            >
              <span class="material-symbols-outlined">alarm</span>
              <div>
                <p
                  class="text-[10px] font-bold uppercase tracking-wider opacity-85"
                >
                  SUBMISSION DEADLINE
                </p>
                <p class="text-sm font-bold">
                  {#if isPastDeadline}
                    提出期限は終了しました：{deadlineInfo.value}
                  {:else}
                    提出期限：{deadlineInfo.value}
                  {/if}
                </p>
              </div>
            </div>
          {/if}

          <!-- Period Selector / Title -->
          <section
            class="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
          >
            <div>
              <h2 class="text-2xl font-black text-slate-800 tracking-tight">
                希望提出
              </h2>
              <p class="text-on-surface-variant text-xs mt-1 font-medium">
                対象期間：{currentPeriodLabel || ""}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <div
                class="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold"
              >
                {currentPeriod.endsWith("-A")
                  ? "前半"
                  : currentPeriod.endsWith("-B")
                    ? "後半"
                    : "月間"}
              </div>
              <div
                class="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full text-xs font-bold text-slate-700"
              >
                <span>{currentUser?.avatar || "🧑‍🍳"}</span>
                <span>{currentUser?.name || "ゲスト"} さん</span>
              </div>
            </div>
          </section>

          <!-- 2カラムレイアウト -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-8 pb-32 md:pb-8">
            <!-- 左側: カレンダー & デフォルト設定 -->
            <div class="lg:col-span-3 space-y-6 min-w-0 w-full overflow-hidden">
              <!-- 未入力日のデフォルト設定 -->
              <div
                class="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm space-y-3"
              >
                <div class="flex items-center justify-between">
                  <span
                    class="text-xs font-bold text-slate-500 uppercase tracking-wider"
                    >未入力日のデフォルト設定</span
                  >
                  {#if submitPattern === "A"}
                    <span
                      class="text-[10px] font-extrabold text-primary bg-primary/5 px-2 py-0.5 rounded-md"
                      >未選択日は出勤になります</span
                    >
                  {:else}
                    <span
                      class="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md"
                      >未選択日は休みになります</span
                    >
                  {/if}
                </div>
                <div
                  class="flex bg-surface-container rounded-xl p-1 gap-1 w-full max-w-[280px]"
                >
                  <button
                    type="button"
                    on:click={() => handlePatternSwitch("A")}
                    disabled={isLocked}
                    class="flex-1 py-2 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer {submitPattern ===
                    'A'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'bg-transparent text-secondary hover:bg-surface-container-high'}"
                  >
                    出勤可能
                  </button>
                  <button
                    type="button"
                    on:click={() => handlePatternSwitch("B")}
                    disabled={isLocked}
                    class="flex-1 py-2 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer {submitPattern ===
                    'B'
                      ? 'bg-surface-container-lowest text-[#005bc1] shadow-sm'
                      : 'bg-transparent text-secondary hover:bg-surface-container-high'}"
                  >
                    休み希望
                  </button>
                </div>
              </div>

              <!-- Calendar Card (Google Stitch デザイン) -->
              <div
                class="bg-surface-container-lowest rounded-[20px] p-3 md:p-5 shadow-sm border border-slate-100"
              >
                <div class="grid grid-cols-7 calendar-grid mb-3">
                  {#each CALENDAR_HEADERS as h}
                    <div
                      class="text-center font-bold text-xs text-on-surface-variant py-1"
                    >
                      {h}
                    </div>
                  {/each}
                </div>

                <div class="grid grid-cols-7 calendar-grid">
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
                      class="h-14 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all active:scale-90 border border-solid select-none outline-none
                      {d.isOtherMonth ? 'opacity-0 pointer-events-none' : ''}
                      {!d.isOtherMonth && isClosed
                        ? 'bg-slate-50 text-slate-400 border-slate-100/50'
                        : ''}
                      {!d.isOtherMonth && !isClosed && isAvail
                        ? 'bg-primary-container/10 text-on-surface border-primary-container/20'
                        : ''}
                      {!d.isOtherMonth && !isClosed && !isAvail
                        ? 'bg-surface-container text-slate-500 border-surface-container'
                        : ''}"
                    >
                      <span class="text-xs font-bold">{d.dayNum}</span>
                      <span class="text-[9px] uppercase opacity-60 mt-0.5"
                        >{d.wName}</span
                      >

                      {#if !d.isOtherMonth && !isClosed}
                        <div
                          class="status-indicator w-1.5 h-1.5 rounded-full mt-1 {isAvail
                            ? 'bg-primary'
                            : 'bg-outline'}"
                        ></div>
                        {#if !isAvail}
                          <span
                            class="text-[8px] font-bold text-on-surface-variant mt-0.5"
                            >休み</span
                          >
                        {/if}
                      {:else if isRegularClosed}
                        <span class="text-[8px] font-bold text-slate-400 mt-1"
                          >定休</span
                        >
                      {:else if specialHolidays.includes(d.dateStr)}
                        <span class="text-[8px] font-bold text-slate-400 mt-1"
                          >臨時</span
                        >
                      {/if}
                    </button>
                  {/each}
                </div>

                <!-- 凡例 -->
                <div
                  class="mt-6 pt-4 border-t border-surface-variant flex justify-between items-center"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-primary"></div>
                    <span class="font-bold text-xs text-on-surface-variant"
                      >出勤可能</span
                    >
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-outline"></div>
                    <span class="font-bold text-xs text-on-surface-variant"
                      >休み希望</span
                    >
                  </div>
                </div>
              </div>

              <!-- 情報案内 -->
              <div
                class="p-4 bg-surface-bright rounded-xl border border-outline-variant/30 flex items-start gap-3"
              >
                <span class="material-symbols-outlined text-secondary"
                  >info</span
                >
                <p class="text-xs text-on-surface-variant leading-relaxed">
                  日付をタップして希望を切り替えてください。未入力の日程は、上記で設定した「デフォルト設定」の内容で送信されます。
                </p>
              </div>
            </div>

            <!-- 右側: 提出ステータス & アシストガイド -->
            <div class="space-y-6">
              <!-- 提出実行カード -->
              <div
                class="bg-white p-6 rounded-[20px] border border-slate-100 shadow-sm space-y-4"
              >
                <h3
                  class="text-sm font-bold text-slate-800 flex items-center gap-2"
                >
                  <span
                    class="material-symbols-outlined text-primary"
                    style="font-size: 18px;">cloud_upload</span
                  >
                  提出ステータス
                </h3>

                <div class="flex items-center gap-2.5 text-xs font-bold">
                  {#if isAutoSaving || hasPendingChanges}
                    <span
                      class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"
                    ></span>
                    <span class="text-primary">下書き保存中...</span>
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
                      >希望提出済み</span
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
                      >未提出（下書き）</span
                    >
                  {/if}
                </div>

                <p
                  class="text-[10px] text-slate-400 leading-relaxed font-semibold"
                >
                  {#if isPastDeadline}
                    ※期限が過ぎたため提出および変更はできません。
                  {:else if isSubmitted}
                    ※期限内であれば、変更して何度でも再提出できます。
                  {:else}
                    ※カレンダーの変更は自動で下書き保存されますが、必ず確定提出を完了させてください。
                  {/if}
                </p>

                <!-- PC用提出ボタン -->
                <button
                  type="button"
                  on:click={handleExplicitSubmit}
                  disabled={isSubmittingShift || isLocked}
                  class="hidden md:flex w-full py-4 transition-all items-center justify-center gap-2 text-sm font-bold rounded-2xl cursor-pointer border-0 active:scale-[0.99] {isSubmitted
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-solid border-slate-200'
                    : 'bg-primary hover:opacity-90 text-on-primary shadow-sm'}"
                >
                  {#if isSubmittingShift}
                    <span class="material-symbols-outlined animate-spin text-sm"
                      >progress_activity</span
                    >
                    <span>送信中...</span>
                  {:else}
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 16px;">send</span
                    >
                    <span
                      >{isSubmitted
                        ? "提出内容を更新（再提出）"
                        : "希望シフトを確定提出する"}</span
                    >
                  {/if}
                </button>
              </div>

              <!-- 提出アシストガイドライン -->
              <div
                class="bg-white p-6 rounded-[20px] border border-slate-100 shadow-sm space-y-4"
              >
                <h3
                  class="text-sm font-bold text-slate-800 flex items-center gap-2"
                >
                  <span
                    class="material-symbols-outlined text-primary"
                    style="font-size: 18px;">menu_book</span
                  >
                  提出ガイドライン
                </h3>
                <ul
                  class="space-y-2.5 text-xs text-slate-500 list-disc list-inside leading-relaxed font-medium"
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

          <!-- モバイル用フローティング固定アクション -->
          {#if !isLocked}
            <div
              class="fixed bottom-24 left-0 w-full z-40 px-margin-mobile md:hidden"
            >
              <button
                type="button"
                on:click={handleExplicitSubmit}
                disabled={isSubmittingShift}
                class="w-full h-[56px] bg-primary text-on-primary font-bold rounded-full shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border-0 cursor-pointer hover:opacity-90"
              >
                {#if isSubmittingShift}
                  <span class="material-symbols-outlined animate-spin text-sm"
                    >progress_activity</span
                  >
                  <span>送信中...</span>
                {:else if isSubmitted}
                  <span class="material-symbols-outlined">check_circle</span>
                  <span>提出内容を更新する</span>
                {:else}
                  <span class="material-symbols-outlined">send</span>
                  <span>シフトを提出する</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- ========================================================================= -->
      <!-- 【管理者画面】管理者ダッシュボード (2カラム ＆ 極小ステータスドット)              -->
      <!-- ========================================================================= -->
      {#if activeTab === "manager"}
        {#if !currentUser.isAdmin}
          <!-- 管理者権限ロック (Apple風極上シンプルデザイン) -->
          <div
            class="min-h-[60vh] flex items-center justify-center bg-white px-6 py-12 animate-popup rounded-3xl border border-slate-200/50 glass-panel shadow-sm mt-8"
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
          <!-- Dashboard Header & Actions -->
          <section class="mb-lg" in:fade={{ duration: 150 }}>
            <div
              class="flex flex-col md:flex-row md:items-end justify-between gap-md mb-md"
            >
              <div>
                <p class="text-label-caps font-label-caps text-secondary mb-1">
                  {currentPeriod.slice(0, 4)}年{Number(
                    currentPeriod.slice(5, 7),
                  )}月
                </p>
                <h2
                  class="font-headline-lg-mobile text-headline-lg-mobile md:text-headline-lg md:font-headline-lg font-bold text-on-surface"
                >
                  シフト管理ボード
                </h2>
              </div>
              <div class="flex flex-col gap-xs w-full md:w-auto">
                <button
                  type="button"
                  on:click={handleReGenerate}
                  disabled={isGenerating}
                  class="bg-primary text-on-primary h-[50px] px-lg rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform border-0 cursor-pointer"
                >
                  <span
                    class="material-symbols-outlined {isGenerating
                      ? 'animate-spin'
                      : ''}">auto_awesome</span
                  >
                  {isGenerating
                    ? "自動生成を実行中..."
                    : "AIシフト自動生成を実行"}
                </button>
                <p
                  class="text-[11px] text-on-secondary-container px-2 flex items-center gap-1"
                >
                  <span class="material-symbols-outlined text-[14px]">info</span
                  >
                  ※店長（固定シフト）を除外した最適化ロジックを適用中
                </p>
              </div>
            </div>

            <!-- Alert Banner (動的警告バインド) -->
            {#if firstAlertDate && firstAlertMsg}
              {@const alertDateParts = firstAlertDate.split("-")}
              {@const alertDateLabel = `${parseInt(alertDateParts[1])}月${parseInt(alertDateParts[2])}日`}
              <div
                class="bg-surface-container-high text-on-surface-variant p-md rounded-xl flex items-center gap-md border border-outline-variant/30 shadow-sm animate-pulse"
              >
                <span class="material-symbols-outlined text-primary">info</span>
                <div class="flex-1 text-body-sm">
                  現在、{alertDateLabel}の調整が必要です。{firstAlertMsg}
                </div>
                <button
                  type="button"
                  on:click={() => {
                    selectedEditDate = firstAlertDate;
                  }}
                  class="text-label-badge font-label-badge border border-outline px-3 py-1 rounded-full cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  確認
                </button>
              </div>
            {/if}
          </section>

          <!-- Calendar Layout (全月カレンダーカード ＆ 設定サイドバーのレスポンシブ2カラム) -->
          <div
            class="grid grid-cols-1 lg:grid-cols-3 gap-6"
            in:fade={{ duration: 150 }}
          >
            <!-- カレンダー (2カラム分) -->
            <div class="lg:col-span-2 space-y-6 min-w-0 w-full overflow-hidden">
              <!-- Full Month Calendar Card -->
              <div
                class="bg-surface-container-lowest rounded-[24px] p-3 md:p-6 shadow-soft border border-slate-100 overflow-hidden"
              >
                <div class="flex items-center justify-between mb-lg">
                  <div class="flex items-center gap-xs">
                    <button
                      type="button"
                      on:click={handlePrevPeriod}
                      class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <span class="material-symbols-outlined text-body-lg"
                        >chevron_left</span
                      >
                    </button>
                    <h3
                      class="font-headline-md text-headline-md font-bold text-on-surface"
                    >
                      {Number(currentPeriod.slice(5, 7))}月
                    </h3>
                    <button
                      type="button"
                      on:click={handleNextPeriod}
                      class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <span class="material-symbols-outlined text-body-lg"
                        >chevron_right</span
                      >
                    </button>
                  </div>
                  <div
                    class="bg-surface-container flex p-1 rounded-full text-xs font-bold text-slate-700"
                  >
                    <button
                      type="button"
                      class="px-4 py-1.5 rounded-full bg-white shadow-sm font-label-badge text-label-badge border-0 cursor-pointer"
                      >月間</button
                    >
                    <button
                      type="button"
                      class="px-4 py-1.5 rounded-full text-secondary font-label-badge text-label-badge border-0 bg-transparent cursor-pointer"
                      >週間</button
                    >
                  </div>
                </div>

                <!-- Calendar Header -->
                <div
                  class="grid grid-cols-7 calendar-grid border-b border-surface-variant mb-2"
                >
                  {#each CALENDAR_HEADERS as h}
                    <div
                      class="text-center py-2 text-label-caps font-label-caps
                      {h === '土'
                        ? 'text-primary'
                        : h === '日'
                          ? 'text-error'
                          : 'text-secondary'}"
                    >
                      {h}
                    </div>
                  {/each}
                </div>

                <!-- Calendar Body (GRID_CELLS ループ) -->
                <div class="grid grid-cols-7 calendar-grid gap-1 md:gap-2">
                  {#each GRID_CELLS as d}
                    {@const isRegularClosed = d.isRegularClosed}
                    {@const isClosed =
                      isRegularClosed || specialHolidays.includes(d.dateStr)}
                    {@const dayShifts = shifts
                      .filter((s) => s.date === d.dateStr)
                      .filter((s) => {
                        if (shiftStatus === "published") return true;
                        const m = members.find((mem) => mem.id === s.member_id);
                        return m ? m.isActive !== false : true;
                      })}

                    {@const isDeficit = !validationResults[d.dateStr]?.isValid}
                    {@const isToday = (() => {
                      const todayStr = new Date().toISOString().split("T")[0];
                      return d.dateStr === todayStr;
                    })()}

                    <button
                      id={`calendar-cell-${d.dateStr}`}
                      type="button"
                      on:click={() => {
                        if (d.isOtherMonth) return;
                        selectedEditDate = d.dateStr;
                      }}
                      disabled={d.isOtherMonth}
                      class="min-h-[80px] md:min-h-[120px] p-1 md:p-1.5 rounded-lg text-left outline-none transition-all flex flex-col justify-between cursor-pointer border border-solid
                      {d.isOtherMonth
                        ? 'bg-surface-container-low opacity-40 pointer-events-none border-transparent'
                        : ''}
                      {!d.isOtherMonth && isToday
                        ? 'border-2 border-primary bg-primary-container/10 shadow-inner'
                        : ''}
                      {!d.isOtherMonth && !isToday && isDeficit
                        ? 'border-error bg-error-container/20 border'
                        : ''}
                      {!d.isOtherMonth && !isToday && !isDeficit
                        ? 'border-surface-variant/40 bg-white hover:border-[#0058bc]/50'
                        : ''}"
                    >
                      <div
                        class="flex justify-between items-start mb-1 text-label-badge w-full"
                      >
                        <span
                          class={isToday
                            ? "font-bold text-primary"
                            : isClosed
                              ? "text-slate-400 font-medium"
                              : "text-slate-700 font-medium"}
                        >
                          {d.dayNum}
                        </span>
                        {#if !d.isOtherMonth && !isClosed && isDeficit}
                          <span class="text-[8px] font-bold text-error"
                            >警告</span
                          >
                        {/if}
                      </div>

                      {#if isClosed}
                        <div
                          class="text-[9px] text-slate-400 font-bold text-center py-2 w-full"
                        >
                          {isRegularClosed ? "定休日" : "臨時休業"}
                        </div>
                      {:else}
                        {@const kitchenShifts = dayShifts.filter(
                          (s) => s.role === "kitchen",
                        )}
                        {@const hallShifts = dayShifts.filter(
                          (s) => s.role === "hall",
                        )}
                        <div class="flex flex-col gap-1 w-full mt-1">
                          <!-- Kitchen Section -->
                          {#if kitchenShifts.length > 0}
                            <div
                              class="flex flex-wrap items-center gap-1 w-full pb-1 border-b border-dashed border-slate-100 last:border-b-0 last:pb-0"
                            >
                              <span
                                class="text-[9px] opacity-65 select-none w-3 flex justify-center"
                                title="キッチン">🍳</span
                              >
                              {#each kitchenShifts as s}
                                {@const staff = members.find((mem) => mem.id == s.member_id)}
                                {@const defaultKitchenTime = (d.isWeekend && staff?.canHappyHour) ? "15:00" : "17:00"}
                                {@const isModified = s.start_time !== defaultKitchenTime}
                                {@const badgeColor = isModified
                                  ? "bg-amber-50 border-amber-300 text-amber-900 shadow-sm"
                                  : "bg-primary-container/10 border-primary-container/30 text-primary"}
                                <div
                                  class="flex flex-col items-center justify-center p-0.5 min-w-[21px] md:min-w-[30px] h-[22px] md:h-[30px] {badgeColor} border border-solid rounded transition-all select-none"
                                  title={`${s.member_name} (${s.start_time}〜)`}
                                >
                                  <span
                                    class="text-[8.5px] md:text-[11px] font-black leading-none"
                                  >
                                    {getMemberInitial(s.member_name, members)}
                                  </span>
                                  <span
                                    class="text-[6.5px] md:text-[8px] leading-none mt-0.5 font-mono font-bold {isModified
                                      ? 'text-rose-600 font-black'
                                      : 'text-slate-500'}"
                                  >
                                    {s.start_time || defaultKitchenTime}
                                  </span>
                                </div>
                              {/each}
                            </div>
                          {/if}

                          <!-- Hall Section -->
                          {#if hallShifts.length > 0}
                            <div
                              class="flex flex-wrap items-center gap-1 w-full"
                            >
                              <span
                                class="text-[9px] opacity-65 select-none w-3 flex justify-center"
                                title="ホール">🛎️</span
                              >
                              {#each hallShifts as s}
                                {@const defaultHallTime = "17:30"}
                                {@const isModified = s.start_time !== defaultHallTime}
                                {@const badgeColor = isModified
                                  ? "bg-amber-50 border-amber-300 text-amber-900 shadow-sm"
                                  : "bg-tertiary-container/10 border-tertiary-container/30 text-tertiary"}
                                <div
                                  class="flex flex-col items-center justify-center p-0.5 min-w-[21px] md:min-w-[30px] h-[22px] md:h-[30px] {badgeColor} border border-solid rounded transition-all select-none"
                                  title={`${s.member_name} (${s.start_time}〜)`}
                                >
                                  <span
                                    class="text-[8.5px] md:text-[11px] font-black leading-none"
                                  >
                                    {getMemberInitial(s.member_name, members)}
                                  </span>
                                  <span
                                    class="text-[6.5px] md:text-[8px] leading-none mt-0.5 font-mono font-bold {isModified
                                      ? 'text-rose-600 font-black'
                                      : 'text-slate-500'}"
                                  >
                                    {s.start_time || defaultHallTime}
                                  </span>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- 要確認ダッシュボード (左右2カラムの特大Appleスタイルカード) -->
              <div
                class="bg-white rounded-[24px] p-6 shadow-soft border border-slate-100 flex flex-col gap-6"
              >
                <!-- ヘッダー -->
                <div class="border-b border-slate-100 pb-3">
                  <h3
                    class="font-bold text-sm text-slate-800 flex items-center gap-1.5 font-sans"
                  >
                    📋 要確認ダッシュボード
                  </h3>
                </div>

                <!-- 左右2カラムレイアウト -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- 【左側：📅 人手不足の日程リスト】 -->
                  <div class="flex flex-col space-y-3">
                    <span
                      class="text-xs font-bold text-slate-700 flex items-center gap-1 font-sans"
                    >
                      ⚠️ 人手不足の日程
                      <span
                        class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-black font-sans"
                      >
                        {deficitDates.length}件
                      </span>
                    </span>

                    <div
                      class="max-h-[220px] overflow-y-auto pr-1 space-y-2 hide-scrollbar"
                    >
                      {#each deficitDates as d}
                        <button
                          type="button"
                          on:click={() => {
                            selectedCalendarDate = d.dateStr;
                            document
                              .getElementById(`calendar-cell-${d.dateStr}`)
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                          class="w-full text-left p-3 rounded-xl border border-solid transition-all duration-200 cursor-pointer flex justify-between items-center text-xs font-sans
                          {d.isKitchenDeficit
                            ? 'bg-red-50/70 border-red-100 hover:border-red-300 text-red-700'
                            : 'bg-amber-50/70 border-amber-100 hover:border-amber-300 text-amber-800'}"
                        >
                          <span class="font-bold">{d.dateLabel}</span>
                          <span
                            class="font-semibold text-[10px] flex items-center gap-1 font-sans"
                          >
                            {d.reason}
                          </span>
                        </button>
                      {:else}
                        <div
                          class="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 font-sans text-xs"
                        >
                          🎉 人手不足の日程はありません！
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- 【右側：👥 未提出スタッフ】 -->
                  <div class="flex flex-col space-y-3">
                    <span
                      class="text-xs font-bold text-slate-700 flex items-center gap-1 font-sans"
                    >
                      ⏳ 未提出のメンバー
                      <span
                        class="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-black font-sans"
                      >
                        {unsubmittedCount}名
                      </span>
                    </span>

                    <div
                      class="flex flex-col justify-between flex-grow space-y-4"
                    >
                      <!-- 未提出スタッフバッジ一覧 -->
                      <div
                        class="max-h-[160px] overflow-y-auto pr-1 flex flex-wrap gap-1.5 align-content-start hide-scrollbar"
                      >
                        {#each unsubmittedMembers as m}
                          {@const isKitchen = m.roles?.includes("kitchen")}
                          <span
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-solid border-slate-200 bg-slate-50 text-slate-700 select-none font-sans"
                          >
                            {m.name}
                            {isKitchen ? "🍳" : "🛎"}
                          </span>
                        {:else}
                          <div
                            class="w-full text-center py-6 text-emerald-700 font-bold text-xs bg-emerald-50/50 rounded-xl border border-solid border-emerald-100 font-sans"
                          >
                            🎉 全員提出済みです！
                          </div>
                        {/each}
                      </div>

                      <!-- 催促通知ボタン -->
                      <div class="pt-2">
                        <button
                          type="button"
                          on:click={handleSendRemind}
                          disabled={unsubmittedCount === 0}
                          class="w-full py-2.5 px-4 bg-primary text-on-primary rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-[0.98] border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all font-sans"
                        >
                          <span class="material-symbols-outlined text-sm"
                            >notifications_active</span
                          >
                          未提出者に催促通知を送る
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- シフト公開・下書き戻しボタン (左右全幅の下部に配置) -->
                <div class="pt-4 border-t border-slate-100">
                  {#if shiftStatus === "published"}
                    <button
                      type="button"
                      on:click={() => revertShiftsToDraft(currentPeriod)}
                      class="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 border-solid h-[50px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] font-sans"
                    >
                      <span class="material-symbols-outlined text-sm">edit</span
                      >
                      シフトを下書きに戻す
                    </button>
                  {:else}
                    <button
                      type="button"
                      on:click={() => publishShifts(currentPeriod)}
                      class="w-full bg-primary text-on-primary h-[50px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md hover:opacity-90 active:scale-[0.98] border-0 cursor-pointer transition-transform font-sans"
                    >
                      <span class="material-symbols-outlined text-sm"
                        >publish</span
                      >
                      シフトを確定して公開
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-6">
              <!-- シフト公開・下書き戻しボタン -->

              <!-- 曜日別一括休業 ＆ 提出締め切り設定パネル -->
              <div
                class="bg-white p-6 rounded-[20px] border border-slate-100 shadow-soft space-y-6"
              >
                <!-- 曜日別一括休業 -->
                <div class="space-y-3">
                  <span
                    class="text-[10px] font-bold text-secondary uppercase tracking-wider block"
                    >曜日別 一括休業設定</span
                  >
                  <div class="grid grid-cols-7 gap-1">
                    {#each ["月", "火", "水", "木", "金", "土", "日"] as w}
                      <button
                        type="button"
                        on:click={() => {
                          if (w === "水") {
                            triggerToast(
                              "⚠️ 水曜日は基本定休日のため、解除はできません。",
                            );
                          } else {
                            selectedBulkClosedDay = w;
                          }
                        }}
                        class="py-2 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer border-solid
                        {w === '水'
                          ? 'bg-red-50 border-red-200 text-red-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}"
                      >
                        {w}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- 締め切り設定 -->
                <div class="space-y-3 pt-4 border-t border-slate-100">
                  <span
                    class="text-[10px] font-bold text-secondary uppercase tracking-wider block"
                    >提出締め切り日時</span
                  >
                  <div class="flex flex-col gap-2">
                    <input
                      type="datetime-local"
                      bind:value={deadlineInput}
                      class="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-[#005bc1] outline-none"
                    />
                    <button
                      type="button"
                      on:click={handleUpdateDeadline}
                      class="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 font-bold text-[10px] text-slate-700 rounded-xl cursor-pointer transition-all border-solid"
                    >
                      締め切り日時を保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- スタッフ籍・退職管理リスト (Google Stitch タブ & 切り替え) -->
          <div
            class="bg-surface-container-lowest rounded-[20px] shadow-soft overflow-hidden border border-slate-100 mt-6"
            in:fade={{ duration: 150 }}
          >
            <div class="flex border-b border-surface-variant">
              <button
                type="button"
                on:click={() => {
                  managerStaffTab = "active";
                }}
                class="flex-1 py-3 text-sm font-bold border-0 cursor-pointer transition-all
                {managerStaffTab === 'active'
                  ? 'bg-white text-primary border-b-2 border-b-primary'
                  : 'bg-slate-50/50 text-secondary hover:bg-slate-100/50'}"
              >
                現在いるスタッフ
              </button>
              <button
                type="button"
                on:click={() => {
                  managerStaffTab = "retired";
                }}
                class="flex-1 py-3 text-sm font-bold border-0 cursor-pointer transition-all
                {managerStaffTab === 'retired'
                  ? 'bg-white text-primary border-b-2 border-b-primary'
                  : 'bg-slate-50/50 text-secondary hover:bg-slate-100/50'}"
              >
                引退したスタッフ
              </button>
            </div>

            <!-- Active Staff Tab (現在いるスタッフ) -->
            {#if managerStaffTab === "active"}
              <div class="p-md space-y-sm">
                {#each members.filter((m) => m.isActive !== false) as m}
                  <div
                    class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl hover:bg-surface-container-low transition-colors border border-transparent border-b-slate-100/60 pb-4"
                  >
                    <button
                      type="button"
                      on:click={() => openWishPreviewModal(m)}
                      class="flex items-center gap-3 bg-transparent border-0 cursor-pointer outline-none hover:opacity-85 text-left p-0 min-w-0 w-full md:w-auto"
                      title={`${m.name}さんの希望カレンダーを表示`}
                    >
                      <div
                        class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0"
                      >
                        {m.initialChar || m.name.charAt(0)}
                      </div>
                      <div class="truncate">
                        <p
                          class="text-sm font-semibold text-slate-800 hover:text-primary truncate"
                        >
                          {m.name} 🔍
                        </p>
                        <p
                          class="text-[12px] text-on-surface-variant flex items-center gap-1.5"
                        >
                          {#if m.roles?.includes("kitchen") && m.roles?.includes("hall")}
                            🍳厨房 / 🛎ホール
                          {:else if m.roles?.includes("kitchen")}
                            🍳キッチン
                          {:else}
                            🛎ホール
                          {/if}
                          {#if m.isTrainee}
                            <span
                              class="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.2 rounded font-black select-none"
                              >🔰 研修中</span
                            >
                          {/if}
                        </p>
                      </div>
                    </button>
                    <div
                      class="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end pt-2 md:pt-0 border-t border-dashed border-slate-100 md:border-t-0"
                    >
                      <!-- 役割(担当)選択セレクト -->
                      <div class="flex flex-col items-start gap-1">
                        <span
                          class="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                          >担当役割</span
                        >
                        <select
                          on:change={(e) => {
                            const select = /** @type {HTMLSelectElement} */ (
                              e.target
                            );
                            const val = select.value;
                            const newRoles =
                              val === "both" ? ["kitchen", "hall"] : [val];
                            updateMemberRoles(m.id, newRoles);
                          }}
                          class="bg-slate-50 border border-slate-200 text-[10px] font-bold rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-[#0071e3] transition-colors cursor-pointer"
                        >
                          <option
                            value="hall"
                            selected={m.roles?.includes("hall") &&
                              !m.roles?.includes("kitchen")}>🛎 ホール</option
                          >
                          <option
                            value="kitchen"
                            selected={m.roles?.includes("kitchen") &&
                              !m.roles?.includes("hall")}>🍳 キッチン</option
                          >
                          <option
                            value="both"
                            selected={m.roles?.includes("kitchen") &&
                              m.roles?.includes("hall")}>🍳🛎 両方</option
                          >
                        </select>
                      </div>

                      <!-- 🍻 ハッピーアワー対応トグルボタン -->
                      <div class="flex flex-col items-start gap-1">
                        <span
                          class="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                          >土日早出</span
                        >
                        <button
                          type="button"
                          on:click={() =>
                            toggleHappyHourAbility(m.id, !m.canHappyHour)}
                          class="text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-solid transition-all duration-150 cursor-pointer h-[28px] flex items-center justify-center
                          {m.canHappyHour
                            ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}"
                        >
                          🍻 {m.canHappyHour ? "対応可能" : "不可"}
                        </button>
                      </div>

                      <!-- 研修中(トレーニング)トグルボタン -->
                      <div class="flex flex-col items-start gap-1">
                        <span
                          class="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                          >研修状況</span
                        >
                        <button
                          type="button"
                          on:click={() => {
                            const nextStatus = m.isTrainee
                              ? "regular"
                              : "trainee";
                            updateMemberStatus(m.id, nextStatus);
                          }}
                          class="text-[10px] font-extrabold px-2.5 py-1 rounded-lg border border-solid transition-all duration-150 cursor-pointer h-[28px] flex items-center justify-center
                          {m.isTrainee
                            ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}"
                        >
                          {m.isTrainee ? "🔰 研修中" : "一般"}
                        </button>
                      </div>

                      <!-- 管理者権限 -->
                      <div class="flex flex-col items-start gap-1">
                        <span
                          class="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                          >権限</span
                        >
                        <button
                          type="button"
                          on:click={() =>
                            toggleAdminPrivilege(m.id, !m.isAdmin)}
                          class="text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border border-solid transition-all duration-150 cursor-pointer h-[28px] flex items-center justify-center
                          {m.isAdmin
                            ? 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}"
                        >
                          {m.isAdmin ? "👑 管理者" : "一般"}
                        </button>
                      </div>

                      <!-- 引退にするボタン -->
                      <div class="flex flex-col items-start gap-1">
                        <span
                          class="text-[9px] md:text-transparent select-none hidden md:inline"
                          >-</span
                        >
                        <button
                          type="button"
                          on:click={() => toggleMemberActive(m.id, false)}
                          class="text-error border border-error/30 hover:bg-error/10 px-3 py-1.5 rounded-full text-label-caps font-label-caps transition-colors cursor-pointer h-[28px] flex items-center justify-center"
                        >
                          引退にする
                        </button>
                      </div>
                    </div>
                  </div>
                {:else}
                  <p
                    class="text-xs text-slate-400 text-center py-6 font-medium"
                  >
                    現在いるスタッフはいません
                  </p>
                {/each}
              </div>
            {/if}

            <!-- Retired Staff Tab (引退したスタッフ) -->
            {#if managerStaffTab === "retired"}
              <div class="p-md space-y-sm">
                {#each members.filter((m) => m.isActive === false) as m}
                  <div
                    class="flex items-center justify-between gap-sm p-2 rounded-lg bg-surface-container-low/30 border border-slate-100 pb-3"
                  >
                    <div class="flex items-center gap-sm opacity-60 min-w-0">
                      <div
                        class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-secondary font-bold text-sm shrink-0"
                      >
                        {m.initialChar || m.name.charAt(0)}
                      </div>
                      <div class="truncate">
                        <p
                          class="text-body-sm font-semibold text-secondary line-through truncate"
                        >
                          {m.name}
                        </p>
                        <p class="text-[12px] text-secondary/70">
                          {#if m.roles?.includes("kitchen") && m.roles?.includes("hall")}
                            🍳厨房 / 🛎ホール
                          {:else if m.roles?.includes("kitchen")}
                            🍳キッチン
                          {:else}
                            🛎ホール
                          {/if}
                        </p>
                      </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      <button
                        type="button"
                        on:click={() => toggleMemberActive(m.id, true)}
                        class="text-primary border border-primary/30 hover:bg-primary/10 px-3 py-1 rounded-full text-label-caps font-label-caps transition-colors cursor-pointer"
                      >
                        現在の方に戻す
                      </button>
                      <button
                        type="button"
                        on:click={() => {
                          if (
                            confirm(
                              `${m.name}さんのデータを完全に削除しますか？`,
                            )
                          ) {
                            deleteMember(m.id);
                          }
                        }}
                        class="text-error hover:bg-error/10 p-1.5 rounded-full transition-colors flex items-center justify-center border-0 bg-transparent cursor-pointer"
                      >
                        <span class="material-symbols-outlined text-[18px]"
                          >delete</span
                        >
                      </button>
                    </div>
                  </div>
                {:else}
                  <p
                    class="text-xs text-slate-400 text-center py-8 font-semibold"
                  >
                    引退処理されたメンバーはいません
                  </p>
                {/each}
              </div>
            {/if}
          </div>

          <!-- システム管理者機能 (データリセット) -->
          <div
            class="bg-white p-6 rounded-[20px] border border-red-100 shadow-soft space-y-4 mt-6"
          >
            <div>
              <h3
                class="text-sm font-bold text-red-600 tracking-tight flex items-center gap-1.5 select-none"
              >
                ⚠️ システム管理者機能 (データリセット)
              </h3>
              <p
                class="text-xs text-slate-400 mt-0.5 font-medium leading-relaxed"
              >
                データベース（全スタッフ籍および全希望シフト）を完全にクリーンリセットします。過去のデータはすべて消去され、デフォルトの管理者（パスコード:
                8888）のみが作成されます。
              </p>
            </div>

            <div class="pt-2">
              <button
                type="button"
                on:click={handleDatabaseReset}
                class="py-3 px-5 transition-all text-xs font-black rounded-2xl cursor-pointer border border-solid bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 shadow-sm active:scale-95"
              >
                🚨 データベースを完全にリセットする
              </button>
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </main>

  <!-- Footer (Google Stitch デザイン完全統合) -->
  <footer
    class="w-full py-8 border-t border-slate-200/50 flex flex-col items-center gap-4 bg-slate-50 mt-auto"
  >
    <div class="flex gap-6">
      <a
        class="font-bold text-xs text-slate-500 hover:text-[#0058bc] transition-colors no-underline"
        href="#/">利用規約</a
      >
      <a
        class="font-bold text-xs text-slate-500 hover:text-[#0058bc] transition-colors no-underline"
        href="#/">プライバシーポリシー</a
      >
      <a
        class="font-bold text-xs text-slate-500 hover:text-[#0058bc] transition-colors no-underline"
        href="#/">ヘルプ</a
      >
    </div>
    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
      © 2024 桃牛苑 Operations Inc.
    </p>
  </footer>

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
                    {@const m = members.find((mem) => mem.id == s.member_id)}
                    {@const isTrainee = m?.status === "trainee"}
                    {@const isWeekendDay = (() => {
                      const dow = new Date(selectedEditDate + 'T00:00:00').getDay();
                      return dow === 0 || dow === 6;
                    })()}
                    {@const defaultTimeForInput = s.role === "kitchen" 
                      ? (isWeekendDay && m?.canHappyHour ? "15:00" : "17:00") 
                      : "17:30"}
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

                        <input
                          type="time"
                          value={s.start_time || defaultTimeForInput}
                          on:change={async (e) => {
                            const target = /** @type {HTMLInputElement} */ (
                              e.target
                            );
                            const newTime = target.value;
                            const updatedShifts = shifts.map((item) => {
                              if (
                                item.date === selectedEditDate &&
                                item.member_id === s.member_id
                              ) {
                                return { ...item, start_time: newTime };
                              }
                              return item;
                            });
                            shifts = updatedShifts;
                            await saveShiftsManually(updatedShifts);
                          }}
                          class="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold px-1.5 py-1 rounded-lg text-slate-700 font-mono focus:outline-none focus:border-primary cursor-pointer w-[75px] md:w-[85px] text-center"
                        />

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
                  {#each members.filter((m) => m.isActive !== false) as m}
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
        <div
          class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3] font-bold border border-[#0071e3]/20 select-none"
            >
              {selectedModalMember.initialChar ||
                selectedModalMember.name.charAt(0)}
            </div>
            <div class="text-left">
              <h3 class="text-sm font-black text-slate-800 tracking-tight">
                {selectedModalMember.name} さんの希望シフト状況
              </h3>
              <p
                class="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider"
              >
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
          <div
            class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-semibold"
          >
            <span class="text-slate-500">提出状況</span>
            <span class="flex items-center gap-1.5 font-bold">
              {#if isModalSubmitted}
                <span
                  class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"
                ></span>
                <span class="text-emerald-600">確定提出済み</span>
              {:else}
                <span
                  class="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                ></span>
                <span class="text-amber-600">下書き保存（未提出）</span>
              {/if}
            </span>
          </div>

          <!-- Calendar Grid -->
          <div class="space-y-3">
            <!-- 曜日ヘッダー -->
            <div
              class="grid grid-cols-7 gap-2.5 text-center text-[10px] font-black text-slate-400 tracking-widest uppercase"
            >
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
                {@const isAvail =
                  modalAvailabilities[d.dateStr] !== undefined
                    ? modalAvailabilities[d.dateStr]
                    : modalSubmitPattern === "A"}
                {@const isNG = !isAvail}

                <div
                  class="aspect-square rounded-xl border flex flex-col justify-between p-2 select-none relative transition-all duration-200 {d.isOtherMonth
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
                      <span class="text-[9px] font-black text-slate-400"
                        >定休</span
                      >
                    {:else if isNG}
                      <span class="text-[9px] font-black text-rose-600 block"
                        >❌ 休み</span
                      >
                    {:else}
                      <span class="text-[9px] font-black text-emerald-600 block"
                        >🟢 出勤</span
                      >
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div
          class="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-end"
        >
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

  /* カレンダー用グリッドレイアウト */
  :global(.calendar-grid) {
    display: grid !important;
    grid-template-columns: repeat(7, 1fr) !important;
    gap: 4px !important;
  }

  @media (min-width: 768px) {
    :global(.calendar-grid) {
      gap: 12px !important;
    }
  }

  /* マテリアルシンボルアイコンの適用 */
  .material-symbols-outlined {
    font-family: "Material Symbols Outlined" !important;
    font-variation-settings:
      "FILL" 0,
      "wght" 400,
      "GRAD" 0,
      "opsz" 24;
    display: inline-block;
    line-height: 1;
  }

  /* スクロールバーの非表示ユーティリティ */
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
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
