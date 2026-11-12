import { Router } from "express";
import createToken from "../controllers/auth.controller.js";

const router = Router();

router.post("/token", createToken);

export default router;