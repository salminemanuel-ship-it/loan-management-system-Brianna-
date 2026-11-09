import { Router } from "express";
import { pool } from "../db";
import { requireAuth, JwtUser } from "../auth";

export const messageRoutes = Router();
messageRoutes.use(requireAuth);

messageRoutes.get("/", async (_req, res) => {
  const user = res.locals.user as JwtUser;
  try {
    const result = await pool.query(
      `SELECT m.id, m.subject, m.body, m.sent_at AS "sentAt", m.read_at AS "readAt",
              u.username AS "senderName"
         FROM user_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.recipient_id = $1 ORDER BY m.sent_at DESC LIMIT 50`,
      [user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load your update messages." });
  }
});

messageRoutes.post("/:id/read", async (req, res) => {
  const user = res.locals.user as JwtUser;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid message." });
  try {
    await pool.query("UPDATE user_messages SET read_at = now() WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL", [id, user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not mark the message as read." });
  }
});
