import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../session.js";
import { asyncHandler, parseJson } from "../util.js";

export const myPracticalRouter = Router();

const practicalRow = (row) => ({
  ...row,
  score: Number(row.score ?? 0),
  max_score: Number(row.max_score ?? 10),
  checklist: parseJson(row.checklist, []),
});

myPracticalRouter.get(
  "/practical-evaluations",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Rotas /api/me são sempre autocontidas. Mesmo um Inspetor não deve
    // transformar uma consulta pessoal em leitura coletiva por possuir role admin.
    const rows = await query(
      `SELECT * FROM practical_evaluations WHERE employee_id = ? ORDER BY evaluation_date DESC, created_at DESC`,
      [req.user.employeeId],
    );
    res.json(rows.map(practicalRow));
  }),
);
