import express, { Request, Response } from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { passwordResetRouter } from "./routes/passwordReset";
import { AVATAR_DIR } from "./services/avatarUpload";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.use("/avatars", express.static(AVATAR_DIR));

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "lms-backend" });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(authRouter);
app.use(passwordResetRouter);

app.listen(PORT, () => {
  console.log(`[lms-backend] listening on http://localhost:${PORT}`);
});
