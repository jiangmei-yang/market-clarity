from __future__ import annotations

import json
import sqlite3
import csv
import io
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, path: str | Path = "data/anshin.db"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self):
        with self.connect() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT DEFAULT '', priority INTEGER DEFAULT 3, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL, shares REAL NOT NULL, cost_price REAL NOT NULL, buy_date TEXT NOT NULL, reason TEXT DEFAULT '', note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL, action TEXT NOT NULL, trade_date TEXT NOT NULL, planned_price REAL, actual_price REAL, quantity REAL, reason TEXT, concern TEXT, invalidation TEXT, holding_plan TEXT, result REAL, review TEXT, mistake_type TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS risk_profiles (id INTEGER PRIMARY KEY CHECK (id = 1), profile_json TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS decision_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                action TEXT NOT NULL,
                original_amount REAL NOT NULL,
                revised_amount REAL,
                user_choice TEXT DEFAULT '',
                plan_json TEXT NOT NULL,
                review_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS user_tests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tester_code TEXT NOT NULL,
                review_id INTEGER,
                rules_completed INTEGER NOT NULL DEFAULT 0,
                original_plan_json TEXT NOT NULL,
                original_amount REAL NOT NULL,
                conflicts_json TEXT NOT NULL,
                risks_acknowledged INTEGER,
                final_choice TEXT NOT NULL,
                revised_amount REAL,
                duration_seconds REAL,
                satisfaction INTEGER,
                repeat_intent INTEGER,
                paid_test_intent INTEGER,
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """)
            columns = {row[1] for row in conn.execute("PRAGMA table_info(decision_reviews)")}
            if "revised_review_json" not in columns:
                conn.execute("ALTER TABLE decision_reviews ADD COLUMN revised_review_json TEXT")

    def _rows(self, table: str):
        if table not in {"watchlist", "positions", "trades"}: raise ValueError("非法表名")
        with self.connect() as conn:
            return [dict(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY rowid DESC")]

    def list_watchlist(self): return self._rows("watchlist")
    def list_positions(self): return self._rows("positions")
    def list_trades(self): return self._rows("trades")

    def add_watch(self, code, name, note="", priority=3):
        with self.connect() as conn:
            conn.execute("INSERT INTO watchlist(code,name,note,priority,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(code) DO UPDATE SET name=excluded.name,note=excluded.note,priority=excluded.priority,updated_at=CURRENT_TIMESTAMP", (code, name, note, int(priority)))

    def delete_watch(self, code):
        with self.connect() as conn: conn.execute("DELETE FROM watchlist WHERE code=?", (code,))

    def add_position(self, **data):
        keys = ["code", "name", "shares", "cost_price", "buy_date", "reason", "note"]
        with self.connect() as conn: conn.execute(f"INSERT INTO positions({','.join(keys)}) VALUES({','.join('?' for _ in keys)})", [data.get(k, "") for k in keys])

    def positions_csv(self) -> str:
        fields = ["code", "name", "shares", "cost_price", "buy_date", "reason", "note"]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
        writer.writeheader(); writer.writerows(self.list_positions())
        return "\ufeff" + buffer.getvalue()

    def import_positions_csv(self, content: bytes | str) -> int:
        text = content.decode("utf-8-sig") if isinstance(content, bytes) else content.lstrip("\ufeff")
        rows = list(csv.DictReader(io.StringIO(text)))
        required = {"code", "name", "shares", "cost_price", "buy_date"}
        if not rows or not required.issubset(rows[0]):
            raise ValueError("CSV格式不正确，请使用本应用导出的持仓备份文件")
        count = 0
        for row in rows:
            if not row.get("code") or float(row.get("shares", 0)) <= 0 or float(row.get("cost_price", 0)) <= 0:
                continue
            self.add_position(code=row["code"].zfill(6), name=row["name"], shares=float(row["shares"]), cost_price=float(row["cost_price"]), buy_date=row["buy_date"], reason=row.get("reason", ""), note=row.get("note", ""))
            count += 1
        return count

    def delete_position(self, row_id):
        with self.connect() as conn: conn.execute("DELETE FROM positions WHERE id=?", (row_id,))

    def add_trade(self, **data):
        keys = ["code", "name", "action", "trade_date", "planned_price", "actual_price", "quantity", "reason", "concern", "invalidation", "holding_plan", "result", "review", "mistake_type"]
        with self.connect() as conn: conn.execute(f"INSERT INTO trades({','.join(keys)}) VALUES({','.join('?' for _ in keys)})", [data.get(k) for k in keys])

    def set_setting(self, key: str, value: Any):
        with self.connect() as conn: conn.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value, ensure_ascii=False)))

    def get_setting(self, key: str, default=None):
        with self.connect() as conn: row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def save_risk_profile(self, profile: dict):
        payload = json.dumps(profile, ensure_ascii=False)
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO risk_profiles(id,profile_json,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP",
                (payload,),
            )

    def get_risk_profile(self, default=None):
        with self.connect() as conn:
            row = conn.execute("SELECT profile_json FROM risk_profiles WHERE id=1").fetchone()
        return json.loads(row[0]) if row else default

    def delete_risk_profile(self):
        with self.connect() as conn:
            conn.execute("DELETE FROM risk_profiles WHERE id=1")

    def add_decision_review(self, plan: dict, review: dict) -> int:
        with self.connect() as conn:
            cursor = conn.execute(
                """INSERT INTO decision_reviews(code,name,action,original_amount,plan_json,review_json)
                VALUES(?,?,?,?,?,?)""",
                (
                    plan["code"], plan["name"], plan["action"], float(plan["amount"]),
                    json.dumps(plan, ensure_ascii=False), json.dumps(review, ensure_ascii=False),
                ),
            )
            return int(cursor.lastrowid)

    def update_decision_review(self, row_id: int, user_choice: str, revised_amount: float | None = None, revised_review: dict | None = None):
        with self.connect() as conn:
            conn.execute(
                "UPDATE decision_reviews SET user_choice=?,revised_amount=?,revised_review_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (user_choice, revised_amount, json.dumps(revised_review, ensure_ascii=False) if revised_review else None, int(row_id)),
            )

    def list_decision_reviews(self):
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM decision_reviews ORDER BY id DESC").fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["plan"] = json.loads(item.pop("plan_json"))
            item["review"] = json.loads(item.pop("review_json"))
            revised_json = item.pop("revised_review_json", None)
            item["revised_review"] = json.loads(revised_json) if revised_json else None
            result.append(item)
        return result

    def delete_decision_review(self, row_id: int):
        with self.connect() as conn:
            conn.execute("DELETE FROM decision_reviews WHERE id=?", (int(row_id),))

    def delete_all_decision_reviews(self):
        with self.connect() as conn:
            conn.execute("DELETE FROM decision_reviews")

    def decision_reviews_csv(self) -> str:
        fields = ["id", "created_at", "code", "name", "action", "original_amount", "revised_amount", "user_choice", "status", "triggered_rules"]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fields)
        writer.writeheader()
        for row in self.list_decision_reviews():
            triggered = [x["title"] for x in row["review"].get("findings", []) if x.get("triggered")]
            writer.writerow({
                **{key: row.get(key) for key in fields},
                "status": row["review"].get("status", ""),
                "triggered_rules": "；".join(triggered),
            })
        return "\ufeff" + buffer.getvalue()

    def add_user_test(self, **data) -> int:
        fields = ["tester_code", "review_id", "rules_completed", "original_plan_json", "original_amount", "conflicts_json", "risks_acknowledged", "final_choice", "revised_amount", "duration_seconds", "satisfaction", "repeat_intent", "paid_test_intent", "notes"]
        values = [data.get(key) for key in fields]
        values[2] = int(bool(values[2]))
        for index in (6, 11, 12):
            if values[index] is not None: values[index] = int(bool(values[index]))
        with self.connect() as conn:
            cursor = conn.execute(f"INSERT INTO user_tests({','.join(fields)}) VALUES({','.join('?' for _ in fields)})", values)
            return int(cursor.lastrowid)

    def list_user_tests(self):
        with self.connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM user_tests ORDER BY id DESC")]

    def user_tests_csv(self) -> str:
        fields = ["tester_code", "created_at", "rules_completed", "original_plan", "original_amount", "conflicts", "risks_acknowledged", "final_choice", "revised_amount", "duration_seconds", "satisfaction", "repeat_intent", "paid_test_intent", "notes"]
        buffer = io.StringIO(); writer = csv.DictWriter(buffer, fieldnames=fields); writer.writeheader()
        for row in self.list_user_tests():
            writer.writerow({
                "tester_code": row["tester_code"], "created_at": row["created_at"],
                "rules_completed": row["rules_completed"], "original_plan": row["original_plan_json"],
                "original_amount": row["original_amount"], "conflicts": row["conflicts_json"],
                "risks_acknowledged": row["risks_acknowledged"], "final_choice": row["final_choice"],
                "revised_amount": row["revised_amount"], "duration_seconds": row["duration_seconds"],
                "satisfaction": row["satisfaction"], "repeat_intent": row["repeat_intent"],
                "paid_test_intent": row["paid_test_intent"], "notes": row["notes"],
            })
        return "\ufeff" + buffer.getvalue()

    def delete_all_user_tests(self):
        with self.connect() as conn:
            conn.execute("DELETE FROM user_tests")
