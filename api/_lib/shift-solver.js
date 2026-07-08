// api/_lib/shift-solver.js
// Vercel 本番対応: Python/PuLP に頼らず純粋な JS で実装した
// 桃牛苑シフト自動生成ソルバー（貪欲法 + 局所探索）
//
// 制約条件（Python版 shift_generator.py と同等）:
//   A-1: 1人1日最大1役割
//   A-2: 水曜日・特別休業日は全員休み
//   A-3: 手動ロックシフトは強制配置
//   B  : 希望不可日はアサインしない / 研修生は土日のみ
//   C  : 研修生は1日最大1名
//   D  : 営業日はキッチン≥1・ホール≥1、総人数 = 2(+ロック数) + 研修生フラグ
//   E  : 通常スタッフの出勤日数を目標日数に近づける

/**
 * @param {object} data - sample_data.json 相当のオブジェクト
 * @returns {Array} assigned_shifts 配列
 */
export function generateShift(data) {
  const { start_date, end_date, members, special_holidays = [], submissions = [], locked_assignments = [] } = data;

  // -------------------------------------------------------
  // 日付ユーティリティ
  // -------------------------------------------------------
  const startD = parseDate(start_date);
  const endD   = parseDate(end_date);
  const dates  = [];
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(new Date(d)));
  }

  const specialHolidaySet = new Set(special_holidays);

  function isHoliday(dateStr) {
    const dow = new Date(dateStr + 'T00:00:00').getDay(); // 0=日,3=水
    return dow === 3 || specialHolidaySet.has(dateStr);
  }
  function isWeekend(dateStr) {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    return dow === 0 || dow === 6;
  }
  function isTrainee(m) {
    return m.status === 'trainee' || m.status === 'training' || m.isTraining === true;
  }
  function isAdmin(m) {
    return m.isAdmin === true;
  }
  function isRegular(m) { return !isTrainee(m) && !isAdmin(m); }

  // -------------------------------------------------------
  // 提出データをマップ化: submissionsMap[member_id][dateStr] = true/false
  // -------------------------------------------------------
  const submissionsMap = {};
  for (const sub of submissions) {
    submissionsMap[sub.member_id] = {};
    for (const [dateStr, avail] of Object.entries(sub.availabilities || {})) {
      submissionsMap[sub.member_id][dateStr] = avail;
    }
  }
  function canWork(m, dateStr) {
    if (isHoliday(dateStr)) return false;
    if (isTrainee(m) && !isWeekend(dateStr)) return false;
    const avail = submissionsMap[m.id]?.[dateStr];
    // avail が明示的に false の時だけ不可（undefined/null/true は出勤可能）
    if (avail === false || avail === 0 || avail === '0') return false;
    return true;
  }

  // -------------------------------------------------------
  // ロックアサインをセットに変換（強制出勤）
  // -------------------------------------------------------
  const lockedSet = new Set(); // key: "member_id|dateStr|role"
  const lockedByDate = {}; // dateStr -> count
  for (const la of locked_assignments) {
    lockedSet.add(`${la.member_id}|${la.date}|${la.role}`);
    lockedByDate[la.date] = (lockedByDate[la.date] || 0) + 1;
  }

  // -------------------------------------------------------
  // アサイン状態テーブル: assignments[dateStr][member_id] = role | null
  // -------------------------------------------------------
  const assignments = {};
  for (const d of dates) {
    assignments[d] = {};
    for (const m of members) assignments[d][m.id] = null;
  }

  // Step 1: ロックされたアサインを先に確定
  for (const la of locked_assignments) {
    if (dates.includes(la.date)) {
      assignments[la.date][la.member_id] = la.role;
    }
  }

  // -------------------------------------------------------
  // 目標出勤日数の管理
  // -------------------------------------------------------
  const targetDays = {};
  for (const m of members) {
    let t = m.targetDays !== undefined ? Number(m.targetDays) : 5;
    if (isRegular(m) && t > 7) t = Math.floor(t / 2);
    targetDays[m.id] = t;
  }

  // -------------------------------------------------------
  // Step 2: 営業日ごとにグリーディ割り当て
  // -------------------------------------------------------
  const businessDates = dates.filter(d => !isHoliday(d));

  for (const dateStr of businessDates) {
    const alreadyAssigned = Object.entries(assignments[dateStr])
      .filter(([, r]) => r !== null)
      .map(([id]) => Number(id));

    // 現在の出勤カウント（ロック含む）
    const currentCount = alreadyAssigned.length;
    const numLocked    = lockedByDate[dateStr] || 0;
    const minRequired  = Math.max(2, numLocked); // 最低人数

    // 必要な追加人数を判定
    const availableRegulars = members
      .filter(m => isRegular(m) && canWork(m, dateStr) && assignments[dateStr][m.id] === null)
      .sort((a, b) => {
        // 土日のキッチンに限り、早出可能（canHappyHour）なメンバーを最優先にする
        if (isWeekend(dateStr)) {
          const aIsKitchen = a.roles.includes('kitchen');
          const bIsKitchen = b.roles.includes('kitchen');
          if (aIsKitchen && bIsKitchen) {
            const aHH = a.canHappyHour ? 1 : 0;
            const bHH = b.canHappyHour ? 1 : 0;
            if (aHH !== bHH) return bHH - aHH;
          }
        }
        // 公平性の重み付け：目標出勤日数に対する消化比率が低い人を最優先する
        const ratioA = workCount(assignments, a.id) / (targetDays[a.id] || 1);
        const ratioB = workCount(assignments, b.id) / (targetDays[b.id] || 1);
        if (Math.abs(ratioA - ratioB) > 0.001) {
          return ratioA - ratioB;
        }
        return workCount(assignments, a.id) - workCount(assignments, b.id);
      });

    const availableTrainees = members
      .filter(m => isTrainee(m) && canWork(m, dateStr) && assignments[dateStr][m.id] === null)
      .sort((a, b) => {
        // 土日のキッチンに限り、早出可能（canHappyHour）なメンバーを最優先にする
        if (isWeekend(dateStr)) {
          const aIsKitchen = a.roles.includes('kitchen');
          const bIsKitchen = b.roles.includes('kitchen');
          if (aIsKitchen && bIsKitchen) {
            const aHH = a.canHappyHour ? 1 : 0;
            const bHH = b.canHappyHour ? 1 : 0;
            if (aHH !== bHH) return bHH - aHH;
          }
        }
        // 公平性の重み付け：目標出勤日数に対する消化比率が低い人を最優先する
        const ratioA = workCount(assignments, a.id) / (targetDays[a.id] || 1);
        const ratioB = workCount(assignments, b.id) / (targetDays[b.id] || 1);
        if (Math.abs(ratioA - ratioB) > 0.001) {
          return ratioA - ratioB;
        }
        return workCount(assignments, a.id) - workCount(assignments, b.id);
      });

    // 研修生が出勤していないか確認
    const traineeOnDay = alreadyAssigned.some(id => {
      const m = members.find(m => m.id === id);
      return m && isTrainee(m);
    });

    // キッチンとホールが揃っているか確認
    const kitchenFilled = alreadyAssigned.some(id => assignments[dateStr][id] === 'kitchen');
    const hallFilled    = alreadyAssigned.some(id => assignments[dateStr][id] === 'hall');

    // 通常スタッフから必要役割を優先的に埋める
    let currentTotal = currentCount;

    // キッチン未充足なら補充
    if (!kitchenFilled) {
      const candidate = availableRegulars.find(m => m.roles.includes('kitchen'));
      if (candidate) {
        assignments[dateStr][candidate.id] = 'kitchen';
        currentTotal++;
        availableRegulars.splice(availableRegulars.indexOf(candidate), 1);
      }
    }

    // ホール未充足なら補充
    if (!hallFilled) {
      const candidate = availableRegulars.find(m =>
        m.roles.includes('hall') && assignments[dateStr][m.id] === null
      );
      if (candidate) {
        assignments[dateStr][candidate.id] = 'hall';
        currentTotal++;
        availableRegulars.splice(availableRegulars.indexOf(candidate), 1);
      }
    }

    // 研修生1名まで追加（土日優先）
    if (!traineeOnDay && availableTrainees.length > 0) {
      const trainee = availableTrainees[0];
      const role = trainee.roles[0]; // 研修生の最初の役割
      assignments[dateStr][trainee.id] = role;
      currentTotal++;
    }

    // 必要最低人数に足りなければ通常スタッフで補充（目標日数が少ない人優先）
    const stillNeeded = minRequired - currentTotal + (traineeOnDay || availableTrainees.length > 0 ? 0 : 0);
    // 実際は currentTotal が minRequired を下回る場合のみ追加
    if (currentTotal < minRequired) {
      const shortage = minRequired - currentTotal;
      const extras = availableRegulars
        .filter(m => assignments[dateStr][m.id] === null)
        .slice(0, shortage);
      for (const m of extras) {
        const role = m.roles.includes('kitchen') ? 'kitchen' : m.roles[0];
        assignments[dateStr][m.id] = role;
        currentTotal++;
      }
    }

    // ----------------------------------------------------
    // 管理者によるヘルプ補填 (それでも枠が埋まっていない場合)
    // ----------------------------------------------------
    let finalKitchenFilled = Object.entries(assignments[dateStr]).some(([id, r]) => r === 'kitchen');
    let finalHallFilled = Object.entries(assignments[dateStr]).some(([id, r]) => r === 'hall');
    let finalTotal = Object.values(assignments[dateStr]).filter(r => r !== null).length;

    const availableAdmins = members.filter(m => m.isAdmin === true && canWork(m, dateStr) && assignments[dateStr][m.id] === null);

    // 1. キッチンが不在の場合、キッチン可能な管理者を割り当て
    if (!finalKitchenFilled && availableAdmins.length > 0) {
      const helperAdmin = availableAdmins.find(m => m.roles.includes('kitchen'));
      if (helperAdmin) {
        assignments[dateStr][helperAdmin.id] = 'kitchen';
        finalTotal++;
        finalKitchenFilled = true;
        availableAdmins.splice(availableAdmins.indexOf(helperAdmin), 1);
      }
    }

    // 2. ホールが不在の場合、ホール可能な管理者を割り当て
    if (!finalHallFilled && availableAdmins.length > 0) {
      const helperAdmin = availableAdmins.find(m => m.roles.includes('hall'));
      if (helperAdmin) {
        assignments[dateStr][helperAdmin.id] = 'hall';
        finalTotal++;
        finalHallFilled = true;
        availableAdmins.splice(availableAdmins.indexOf(helperAdmin), 1);
      }
    }

    // 3. まだ最低人数 minRequired を満たしていない場合、残りの管理者を投入
    if (finalTotal < minRequired && availableAdmins.length > 0) {
      const shortage = minRequired - finalTotal;
      const helpers = availableAdmins.slice(0, shortage);
      for (const m of helpers) {
        const role = m.roles.includes('kitchen') ? 'kitchen' : m.roles[0];
        assignments[dateStr][m.id] = role;
        finalTotal++;
      }
    }
  }

  // -------------------------------------------------------
  // Step 3: 目標日数調整（局所探索）
  // 目標を超えているスタッフから日付の低優先日を削除し、
  // 目標に届いていないスタッフに再割り当てを試みる
  // -------------------------------------------------------
  for (let iter = 0; iter < 5; iter++) {
    let improved = false;

    for (const m of members) {
      if (!isRegular(m)) continue;
      const current = workCount(assignments, m.id);
      const target  = targetDays[m.id];

      // 超過しているスタッフから削減
      if (current > target) {
        // ロックされていない日のアサインを探す（最低人数を下回らない日のみ）
        for (const d of businessDates) {
          if (workCount(assignments, m.id) <= target) break;
          if (assignments[d][m.id] === null) continue;
          if (lockedSet.has(`${m.id}|${d}|${assignments[d][m.id]}`)) continue;

          // この日から除いても制約を満たすか確認
          const dayCount = Object.values(assignments[d]).filter(r => r !== null).length;
          const numLocked = lockedByDate[d] || 0;
          const minReq = Math.max(2, numLocked);
          const traineeCount = Object.entries(assignments[d])
            .filter(([id, r]) => r !== null && isTrainee(members.find(mm => mm.id === Number(id))))
            .length;

          if (dayCount - 1 < minReq) continue; // 人数が足りなくなる

          // キッチン/ホールが維持されるか確認
          const removedRole = assignments[d][m.id];
          const remainingRoles = Object.entries(assignments[d])
            .filter(([id, r]) => r !== null && Number(id) !== m.id)
            .map(([, r]) => r);
          if (removedRole === 'kitchen' && !remainingRoles.includes('kitchen')) continue;
          if (removedRole === 'hall'    && !remainingRoles.includes('hall'))    continue;

          assignments[d][m.id] = null;
          improved = true;
        }
      }

      // 不足しているスタッフに追加
      if (workCount(assignments, m.id) < target) {
        for (const d of businessDates) {
          if (workCount(assignments, m.id) >= target) break;
          if (assignments[d][m.id] !== null) continue;
          if (!canWork(m, d)) continue;

          // 研修生が既にいる日は総人数 = minReq+1 まで
          const dayCount = Object.values(assignments[d]).filter(r => r !== null).length;
          const numLocked = lockedByDate[d] || 0;
          const traineeOnDay = Object.entries(assignments[d])
            .some(([id, r]) => r !== null && isTrainee(members.find(mm => mm.id === Number(id))));
          const maxAllowed = Math.max(2, numLocked) + (traineeOnDay ? 1 : 0);
          if (dayCount >= maxAllowed + 1) continue; // 上限超え

          const role = m.roles.includes('hall') ? 'hall' : m.roles[0];
          assignments[d][m.id] = role;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // -------------------------------------------------------
  // Step 4: 結果を出力形式に変換
  // -------------------------------------------------------
  const result = [];
  for (const dateStr of dates) {
    if (isHoliday(dateStr)) continue;
    for (const m of members) {
      const role = assignments[dateStr][m.id];
      if (role === null) continue;

      let startTime = role === 'kitchen' ? '17:00' : '17:30';

      // 土日で、キッチンのスタッフが土日早出（ハッピーアワー）対応可能であれば 15:00 開始とする
      if (isWeekend(dateStr) && role === 'kitchen' && m.canHappyHour) {
        startTime = '15:00';
      }

      // 手動ロックシフトが存在する場合は、その元の開始時間を最優先で保持する
      const lockedShift = locked_assignments.find(
        (la) => Number(la.member_id) === m.id && la.date === dateStr && la.role === role
      );
      if (lockedShift && lockedShift.start_time) {
        startTime = lockedShift.start_time;
      }

      const isLocked  = lockedSet.has(`${m.id}|${dateStr}|${role}`);
      result.push({
        date:        dateStr,
        member_id:   m.id,
        member_name: m.name,
        role,
        start_time:  startTime,
        end_time:    '22:00',
        isLocked
      });
    }
  }

  return result;
}

// -------------------------------------------------------
// ヘルパー
// -------------------------------------------------------
function parseDate(str) {
  return new Date(str + 'T00:00:00');
}
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function workCount(assignments, memberId) {
  return Object.values(assignments).filter(dayMap => dayMap[memberId] !== null).length;
}
