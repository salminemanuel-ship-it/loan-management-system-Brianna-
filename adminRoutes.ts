import { Router } from "express";
import { pool } from "../db";
import { requireAuth, JwtUser } from "../auth";
import { audit } from "../audit";

export const adminRoutes = Router();
adminRoutes.use(requireAuth, (req, res, next) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "admin") return res.status(403).json({ message: "Only a system administrator can manage users." });
  next();
});

adminRoutes.get("/accounts", async (_req, res) => {
  try {
    const result = await pool.query(
            `SELECT id, username, full_name AS "fullName", phone, role,
              requested_role AS "requestedRole", active,
              admin_locked AS "adminLocked", created_at AS "createdAt"
         FROM users ORDER BY active DESC, full_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load system accounts." });
  }
});

adminRoutes.get("/recent-signins", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, at AS "signedInAt"
         FROM audit_log WHERE action = 'Signed in' AND at >= now() - interval '1 hour'
        ORDER BY at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load recent sign-ins." });
  }
});

adminRoutes.post("/accounts/:id/:action", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  const id = Number(req.params.id);
  const action = req.params.action;
  if (!Number.isInteger(id) || id < 1 || !["lock", "unlock"].includes(action)) {
    return res.status(400).json({ message: "Invalid account action." });
  }
  if (id === actor.id) return res.status(400).json({ message: "You cannot lock your own administrator account." });
  try {
    const locked = action === "lock";
    const result = await pool.query(
      "UPDATE users SET admin_locked = $2 WHERE id = $1 RETURNING username",
      [id, locked]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Account not found." });
    await audit(actor.username, locked ? "Account locked by administrator" : "Account unlocked by administrator", id.toString(), result.rows[0].username);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update this account." });
  }
});

adminRoutes.get("/message-recipients", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name AS "fullName", role FROM users
        WHERE active = TRUE ORDER BY full_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load message recipients." });
  }
});

adminRoutes.post("/messages", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  const { recipientId, subject, body } = req.body ?? {};
  if ((recipientId !== "all" && !Number.isInteger(Number(recipientId))) || typeof subject !== "string" || typeof body !== "string") {
    return res.status(400).json({ message: "Choose a recipient and enter a subject and message." });
  }
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();
  if (!cleanSubject || cleanSubject.length > 100 || !cleanBody || cleanBody.length > 2000) {
    return res.status(400).json({ message: "Subject is required (up to 100 characters) and message must be 1–2,000 characters." });
  }
  try {
    const recipients = recipientId === "all"
      ? await pool.query("SELECT id FROM users WHERE active = TRUE")
      : await pool.query("SELECT id FROM users WHERE id = $1 AND active = TRUE", [Number(recipientId)]);
    if (!recipients.rowCount) return res.status(404).json({ message: "No active recipient was found." });
    const values: unknown[] = [];
    const rows = recipients.rows.map(({ id }: { id: number }) => {
      values.push(actor.id, id, cleanSubject, cleanBody);
      const offset = values.length - 3;
      return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });
    await pool.query(
      `INSERT INTO user_messages (sender_id, recipient_id, subject, body) VALUES ${rows.join(", ")}`,
      values
    );
    await audit(actor.username, "Update message sent", recipientId === "all" ? "all" : String(recipientId), cleanSubject);
    res.status(201).json({ sent: recipients.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not send the update message." });
  }
});
