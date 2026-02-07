import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { CommentService } from '../services/comment.service.js';
import { createCommentSchema } from '../schemas/validation.js';

const router = Router();

function getCommentService(req: Request): CommentService {
  const db = req.app.get('db');
  return new CommentService(db);
}

// POST /tasks/:taskId/comments - Add comment (member)
router.post('/tasks/:taskId/comments', authMiddleware, (req: Request, res: Response) => {
  const data = validateBody(createCommentSchema, req.body);

  const service = getCommentService(req);
  const comment = service.createComment(req.params.taskId, req.user!.userId, data.body);

  res.status(201).json({ success: true, data: comment });
});

// GET /tasks/:taskId/comments - List comments (member)
router.get('/tasks/:taskId/comments', authMiddleware, (req: Request, res: Response) => {
  const service = getCommentService(req);
  const comments = service.listComments(req.params.taskId, req.user!.userId);

  res.json({ success: true, data: comments });
});

// DELETE /comments/:id - Delete comment (author/admin only)
router.delete('/comments/:id', authMiddleware, (req: Request, res: Response) => {
  const service = getCommentService(req);
  service.deleteComment(req.params.id, req.user!.userId, req.user!.role);

  res.status(204).send();
});

export default router;
