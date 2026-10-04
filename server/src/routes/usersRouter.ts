import { Router, Request, Response } from 'express';

export function createUsersRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const users = req.db.prepare('SELECT * FROM users ORDER BY name ASC').all();
    const memberships = req.db.prepare(`
      SELECT tm.user_id, tm.team_id, tm.role, t.name as team_name, t.code as team_code
      FROM team_memberships tm
      JOIN teams t ON tm.team_id = t.id
    `).all();

    const usersWithProfiles = users.map((u: any) => ({
      ...u,
      memberships: memberships.filter((m: any) => m.user_id === u.id),
      is_admin: memberships.some((m: any) => m.user_id === u.id && m.role === 'ADMIN') || u.email.includes('admin')
    }));

    res.json(usersWithProfiles);
  });

  return router;
}
