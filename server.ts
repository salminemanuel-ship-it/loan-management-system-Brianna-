import express from "express";
import cors from "cors";
import { config } from "./config";
import { authRoutes } from "./routes/authRoutes";
import { dashboardRoutes } from "./routes/dashboardRoutes";
import { customerRoutes } from "./routes/customerRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { messageRoutes } from "./routes/messageRoutes";
import { loanRoutes } from "./routes/loanRoutes";
import { managementRoutes } from "./routes/managementRoutes";
import { overviewRoutes } from "./routes/overviewRoutes";

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const localDevelopmentOrigin = origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    callback(null, !origin || origin === config.clientOrigin || localDevelopmentOrigin);
  },
}));
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/management", managementRoutes);
app.use("/api/overview", overviewRoutes);

app.listen(config.port, () => {
  console.log(`BML LMS API running on http://localhost:${config.port}`);
});
