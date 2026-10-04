import { Router, Request, Response } from 'express';

export function createTeamsRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const teams = req.db.prepare('SELECT * FROM teams ORDER BY name ASC').all();
    const memberships = req.db.prepare(`
      SELECT tm.*, u.name as user_name, u.email as user_email, u.role_title
      FROM team_memberships tm
      JOIN users u ON tm.user_id = u.id
    `).all();

    const teamsWithMembers = teams.map((team: any) => ({
      ...team,
      members: memberships.filter((m: any) => m.team_id === team.id)
    }));

    res.json(teamsWithMembers);
  });

  return router;
}
