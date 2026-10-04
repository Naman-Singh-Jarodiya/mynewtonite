import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { UserWithProfile, UserRole } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      actor?: UserWithProfile;
      db: Database.Database;
    }
  }
}

export function authContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Support both header and query param for flexible SSE / API usage
  const actorId = (req.headers['x-actor-id'] as string) || 
                  (req.headers['x-user-id'] as string) || 
                  (req.query.actor_id as string) || 
                  'usr-marcus-lead';

  const userStmt = req.db.prepare('SELECT * FROM users WHERE id = ?');
  const user = userStmt.get(actorId) as any;

  if (!user) {
    const fallback = req.db.prepare('SELECT * FROM users LIMIT 1').get() as any;
    if (!fallback) {
      res.status(401).json({ error: 'No users found in operations platform' });
      return;
    }
    attachActor(req, fallback);
    next();
    return;
  }

  attachActor(req, user);
  next();
}

function attachActor(req: Request, user: any): void {
  const membershipsStmt = req.db.prepare(`
    SELECT tm.team_id, tm.role, t.name as team_name, t.code as team_code
    FROM team_memberships tm
    JOIN teams t ON tm.team_id = t.id
    WHERE tm.user_id = ?
  `);

  const memberships = membershipsStmt.all(user.id) as {
    team_id: string;
    role: UserRole;
    team_name: string;
    team_code: string;
  }[];

  const isAdmin = memberships.some(m => m.role === 'ADMIN') || user.email.includes('admin');

  req.actor = {
    id: user.id,
    name: user.name,
    email: user.email,
    role_title: user.role_title,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    memberships,
    is_admin: isAdmin
  };
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.actor.is_admin) {
      next();
      return;
    }

    const hasPermission = req.actor.memberships.some(m => allowedRoles.includes(m.role));
    if (!hasPermission) {
      res.status(403).json({
        error: `Forbidden: Action requires one of the following permissions: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
}
