#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
from datetime import datetime, timedelta

# PuLPのインポートを試み、無ければインストールを促すか自動インポートする
try:
    import pulp
except ImportError:
    print("【警告】数理最適化ライブラリ 'pulp' が見つかりません。")
    print("自動的に 'pip install pulp' を実行してインストールを試みます...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pulp"])
        import pulp
        print("'pulp' のインストールに成功しました。\n" + "="*50)
    except Exception as e:
        print(f"エラー: 'pulp' のインストールに失敗しました: {e}")
        print("手動で 'pip install pulp' を実行した後に再度スクリプトを動かしてください。")
        sys.exit(1)

def generate_shift(data_path="sample_data.json"):
    # 1. データの読み込み
    if not os.path.exists(data_path):
        print(f"エラー: データファイル {data_path} が見つかりません。")
        return None

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    start_date = datetime.strptime(data["start_date"], "%Y-%m-%d").date()
    end_date = datetime.strptime(data["end_date"], "%Y-%m-%d").date()
    members = data["members"]
    special_holidays = {datetime.strptime(d, "%Y-%m-%d").date() for d in data["special_holidays"]}

    # 日付リストの生成
    dates = []
    curr = start_date
    while curr <= end_date:
        dates.append(curr)
        curr += timedelta(days=1)

    # 提出スケジュールデータのパース
    submissions = {}
    for sub in data["submissions"]:
        m_id = sub["member_id"]
        submissions[m_id] = {}
        for d_str, avail in sub["availabilities"].items():
            submissions[m_id][datetime.strptime(d_str, "%Y-%m-%d").date()] = avail

    # 従業員のマップ
    member_dict = {m["id"]: m for m in members}

    # 2. 数理最適化モデルの定義 (LpMinimize: 目標日数との誤差を最小化)
    prob = pulp.LpProblem("Momogyuen_Shift_Scheduling", pulp.LpMinimize)

    # 3. 決定変数の定義
    # x[i, d, r] = 1 ならば 従業員 i が 日 d に役割 r で出勤、0 ならば出勤しない
    x = {}
    for m in members:
        m_id = m["id"]
        for d in dates:
            for r in m["roles"]:
                x[(m_id, d, r)] = pulp.LpVariable(f"x_{m_id}_{d.strftime('%Y%m%d')}_{r}", cat=pulp.LpBinary)

    # y[d] = 1 ならば 日 d に研修中のメンバーが出勤、0 ならば出勤しない
    y = {}
    for d in dates:
        y[d] = pulp.LpVariable(f"y_{d.strftime('%Y%m%d')}", cat=pulp.LpBinary)

    # 通常バイトの出勤日数が目標値「10日」（期間目安）からどれだけずれているかを表す変数（絶対誤差の線形化）
    # 目標日数 = 10日 (30日間の月間シフト)
    target_days = 10
    e_pos = {}
    e_neg = {}
    for m in members:
        if m["status"] == "regular":
            m_id = m["id"]
            e_pos[m_id] = pulp.LpVariable(f"e_pos_{m_id}", lowBound=0, cat=pulp.LpContinuous)
            e_neg[m_id] = pulp.LpVariable(f"e_neg_{m_id}", lowBound=0, cat=pulp.LpContinuous)

    # 4. 制約条件の追加

    # 制約 (A-1): 1人1日最大1つの役割のみ
    for m in members:
        m_id = m["id"]
        for d in dates:
            prob += pulp.lpSum(x[(m_id, d, r)] for r in m["roles"]) <= 1

    # 制約 (A-2): 定休日（水曜日）および特別休業日は全員出勤しない
    for d in dates:
        is_holiday = (d.weekday() == 2) or (d in special_holidays) # 2 = 水曜日
        if is_holiday:
            for m in members:
                for r in m["roles"]:
                    prob += x[(m["id"], d, r)] == 0

    # 制約 (B): 希望シフト（出勤不可日）はシフトを割り当てない
    # さらに研修生は「土日のみ」出勤可能とする
    for m in members:
        m_id = m["id"]
        for d in dates:
            avail = submissions.get(m_id, {}).get(d, False)
            if m["status"] == "trainee":
                # 研修生は土日(5=土, 6=日)以外は強制出勤不可
                if d.weekday() not in (5, 6):
                    for r in m["roles"]:
                        prob += x[(m_id, d, r)] == 0
                elif not avail:
                    for r in m["roles"]:
                        prob += x[(m_id, d, r)] == 0
            else:
                if not avail:
                    for r in m["roles"]:
                        prob += x[(m_id, d, r)] == 0

    # 制約 (C): 研修生の出勤フラグ y[d] の定義
    trainees = [m for m in members if m["status"] == "trainee"]
    for d in dates:
        if trainees:
            for t in trainees:
                for r in t["roles"]:
                    # 研修生 t がどれかの役割で出勤したら y[d] は必ず 1
                    prob += y[d] >= x[(t["id"], d, r)]
            # y[d] は研修生の出勤数の総和以下（誰も出勤しなければ必ず 0）
            prob += y[d] <= pulp.lpSum(x[(t["id"], d, r)] for t in trainees for r in t["roles"])
        else:
            prob += y[d] == 0

    # 制約 (D): 営業日ごとの人数と役割の確保
    # キッチン最低1名、ホール最低1名
    # 研修生がいる日は総出勤人数 3名、いない日は 2名
    for d in dates:
        is_holiday = (d.weekday() == 2) or (d in special_holidays)
        if not is_holiday:
            # キッチン最低1名
            prob += pulp.lpSum(x[(m["id"], d, "kitchen")] for m in members if "kitchen" in m["roles"]) >= 1
            # ホール最低1名
            prob += pulp.lpSum(x[(m["id"], d, "hall")] for m in members if "hall" in m["roles"]) >= 1
            # 総人数 = 2 + y[d] (研修生がいる日は3名、いない日は2名)
            prob += pulp.lpSum(x[(m["id"], d, r)] for m in members for r in m["roles"]) == 2 + y[d]

    # 制約 (E): 通常バイトの平準化制約 (実働日数 - 目標日数 = プラス誤差 - マイナス誤差)
    for m in members:
        if m["status"] == "regular":
            m_id = m["id"]
            work_days = pulp.lpSum(x[(m_id, d, r)] for d in dates for r in m["roles"])
            prob += work_days - target_days == e_pos[m_id] - e_neg[m_id]

    # 5. 目的関数の設定 (通常バイトの目標日数に対する誤差の総和を最小化)
    prob += pulp.lpSum(e_pos[m["id"]] + e_neg[m["id"]] for m in members if m["status"] == "regular")

    # 6. ソルバーの実行
    print("最適化ソルバーを実行中...")
    status = prob.solve(pulp.PULP_CBC_CMD(msg=False))

    if pulp.LpStatus[status] != "Optimal":
        print(f"警告: 最適解が見つかりませんでした (ステータス: {pulp.LpStatus[status]})")
        return None

    print("最適シフトの生成に成功しました！\n" + "="*50)

    # 結果の収集と出力
    assigned_shifts = []
    
    # 曜日名の定義
    weekday_names = ["月", "火", "水", "木", "金", "土", "日"]

    # 日ごとの出力
    print(f"【桃牛苑 シフト表（期間: {start_date} 〜 {end_date}）】")
    print(f"{'日付':<12} | {'状態':<6} | {'出勤人数':<4} | {'出勤メンバー (役割 / 時間)':<40}")
    print("-" * 80)

    for d in dates:
        is_holiday = (d.weekday() == 2) or (d in special_holidays)
        w_name = weekday_names[d.weekday()]
        date_str = f"{d.strftime('%m/%d')}({w_name})"

        if is_holiday:
            status_str = "定休日" if d.weekday() == 2 else "臨時休業"
            print(f"{date_str:<12} | {status_str:<6} | {'-':<4} | 全員休み")
            continue

        # 出勤している人を取得
        today_staff = []
        for m in members:
            m_id = m["id"]
            for r in m["roles"]:
                if pulp.value(x[(m_id, d, r)]) > 0.9:
                    # 勤務開始時間の設定
                    start_time = "17:00" if r == "kitchen" else "17:30"
                    today_staff.append({
                        "id": m_id,
                        "name": m["name"],
                        "role": r,
                        "status": m["status"],
                        "time": f"{start_time}〜"
                    })
                    # 保存用データ
                    assigned_shifts.append({
                        "date": d.strftime("%Y-%m-%d"),
                        "member_id": m_id,
                        "member_name": m["name"],
                        "role": r,
                        "start_time": start_time,
                        "end_time": "22:00" # 仮の閉店時間
                    })
        
        staff_info_list = [f"{s['name']}({s['role']=='kitchen' and '厨' or 'ホ'}:{s['time']})" for s in today_staff]
        staff_str = ", ".join(staff_info_list)
        print(f"{date_str:<12} | 営業日 | {len(today_staff):<4}人 | {staff_str}")

    print("=" * 80)
    
    # 個人別の合計出勤日数
    print("【個人別 出勤日数サマリー】")
    for m in members:
        m_id = m["id"]
        total_days = sum(pulp.value(x[(m_id, d, r)]) for d in dates for r in m["roles"])
        m_type = "通常" if m["status"] == "regular" else "研修"
        role_type = " & ".join(["キッチン" if r == "kitchen" else "ホール" for r in m["roles"]])
        print(f"- {m['name']:<15} ({m_type}・{role_type}): {int(total_days)}日 / 目標 {target_days if m['status'] == 'regular' else '土日のみ'}日")
    print("=" * 80)

    # 7. ルール・制約の自動検証テスト（アサーション）
    print("【制約検証テストの実行】")
    test_passed = True
    
    for d in dates:
        is_holiday = (d.weekday() == 2) or (d in special_holidays)
        today_staff = []
        for m in members:
            for r in m["roles"]:
                if pulp.value(x[(m["id"], d, r)]) > 0.9:
                    staff_copy = m.copy()
                    staff_copy["role"] = r
                    today_staff.append(staff_copy)
        
        # 1. 水曜日と特別休業日は誰も出勤していないか
        if is_holiday:
            if len(today_staff) > 0:
                print(f"❌ エラー: {d} (休業日) に出勤が発生しています。")
                test_passed = False
            continue
            
        # 2. 営業日にキッチン1名以上、ホール1名以上いるか
        kitchen_count = sum(1 for s in today_staff if s["role"] == "kitchen")
        hall_count = sum(1 for s in today_staff if s["role"] == "hall")
        if kitchen_count < 1:
            print(f"❌ エラー: {d} にキッチンが不在です。")
            test_passed = False
        if hall_count < 1:
            print(f"❌ エラー: {d} にホールが不在です。")
            test_passed = False
            
        # 3. 研修生が出勤している日の総人数は3名か
        has_trainee = any(s["status"] == "trainee" for s in today_staff)
        if has_trainee:
            if len(today_staff) != 3:
                print(f"❌ エラー: {d} に研修生が出勤していますが、総人数が3名ではありません (現在: {len(today_staff)}名)。")
                test_passed = False
        else:
            if len(today_staff) != 2:
                print(f"❌ エラー: {d} に研修生が出勤していませんが、総人数が2名ではありません (現在: {len(today_staff)}名)。")
                test_passed = False
                
    # 4. 研修生は土日のみ割り当てられているか
    for m in members:
        if m["status"] == "trainee":
            for d in dates:
                for r in m["roles"]:
                    if pulp.value(x[(m["id"], d, r)]) > 0.9:
                        if d.weekday() not in (5, 6):
                            print(f"❌ エラー: 研修生 {m['name']} が平日の {d} に割り当てられています。")
                            test_passed = False
                        
    if test_passed:
        print("✅ すべての制約条件テストを完全にクリアしました！ (定休日、特別休業日、必須人数・役割、研修生人数、土日制約)")
    else:
        print("❌ 制約条件テストでエラーが検出されました。")

    # 8. 結果のJSON保存
    output_path = "assigned_shifts.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(assigned_shifts, f, ensure_ascii=False, indent=2)
    
    # public フォルダにも保存（Svelteからfetchしやすくするため）
    os.makedirs("public", exist_ok=True)
    public_path = os.path.join("public", "assigned_shifts.json")
    try:
        with open(public_path, "w", encoding="utf-8") as f:
            json.dump(assigned_shifts, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"警告: public/assigned_shifts.json の保存に失敗しました: {e}")
        
    print(f"確定シフトを下書きデータとして {output_path} に保存しました。")
    print("=" * 80)

if __name__ == "__main__":
    generate_shift()
