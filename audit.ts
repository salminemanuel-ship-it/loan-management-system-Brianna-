import { pool } from "./db";

export async function audit(username: string, action: string, record = "", detail = "") {
  await pool.query(
    "INSERT INTO audit_log (username, action, record, detail) VALUES ($1, $2, $3, $4)",
    [username, action, record, detail]
  );
}