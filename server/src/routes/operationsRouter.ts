import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  OperationService, 
  ConcurrencyConflictError, 
  ValidationError, 
  ForbiddenError, 
  NotFoundError 
} from '../services/operationService.js';
import { StreamHub } from '../events/streamHub.js';

export function createOperationsRouter(): Router {
  const router = Router();

  // GET /api/operations - Paginated search and filtering
  router.get('/', (req: Request, res: Response) => {
    const service = new OperationService(req.db);
    
    const filters = {
      query: req.query.query as string,
      team_id: req.query.team_id as string,
      user_id: req.query.user_id as string,
      category: req.query.category as any,
      severity: req.query.severity as any,
      unassigned: req.query.unassigned === 'true',
      pending_signoff: req.query.pending_signoff === 'true',
      sla_breached: req.query.sla_breached === 'true' ? true : req.query.sla_breached === 'false' ? false : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      page_size: req.query.page_size ? parseInt(req.query.page_size as string, 10) : 20,
      order_by: req.query.order_by as any,
      order_direction: req.query.order_direction as any,
      status: req.query.status ? (Array.isArray(req.query.status) ? req.query.status as any : [req.query.status as any]) : undefined
    };

    const result = service.listOperations(filters);
    res.json(result);
  });

  // GET /api/operations/:id - Detail view with audit and discussion
  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = new OperationService(req.db);
      const data = service.getOperationById(req.params.id);
      res.json(data);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations - Create directive
  const createSchema = z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    category: z.enum(['SYSTEM_INCIDENT', 'FINANCIAL_TX', 'CUSTOMER_ESCALATION', 'SECURITY_COMPLIANCE', 'INFRA_MAINTENANCE', 'DATA_PIPELINE']),
    severity: z.enum(['SEV1_CRITICAL', 'SEV2_HIGH', 'SEV3_MEDIUM', 'SEV4_LOW']),
    assigned_team_id: z.string(),
    assigned_user_id: z.string().optional(),
    requires_dual_signoff: z.boolean().optional(),
    metadata: z.record(z.any()).optional()
  });

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createSchema.parse(req.body);
      const service = new OperationService(req.db);
      const created = service.createOperation(parsed, req.actor!);
      res.status(201).json(created);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations/:id/claim - Claim responsibility with OCC
  const claimSchema = z.object({
    expected_version: z.number().int().positive()
  });

  router.post('/:id/claim', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = claimSchema.parse(req.body);
      const service = new OperationService(req.db);
      const updated = service.claimOperation(req.params.id, req.actor!, parsed.expected_version);
      res.json(updated);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations/:id/transition - Advance status with OCC and guards
  const transitionSchema = z.object({
    target_status: z.enum(['INTAKE', 'TRIAGED', 'ACTIVE', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED_ABORTED']),
    expected_version: z.number().int().positive(),
    resolution_notes: z.string().optional(),
    root_cause_category: z.string().optional(),
    reason: z.string().optional()
  });

  router.post('/:id/transition', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = transitionSchema.parse(req.body);
      const service = new OperationService(req.db);
      const updated = service.transitionStatus(
        req.params.id,
        parsed.target_status,
        req.actor!,
        parsed.expected_version,
        {
          resolution_notes: parsed.resolution_notes,
          root_cause_category: parsed.root_cause_category,
          reason: parsed.reason
        }
      );
      res.json(updated);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations/:id/signoff - Dual-signoff approval/rejection with Segregation of Duties
  const signoffSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    notes: z.string().default(''),
    expected_version: z.number().int().positive()
  });

  router.post('/:id/signoff', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = signoffSchema.parse(req.body);
      const service = new OperationService(req.db);
      const updated = service.recordSignoff(
        req.params.id,
        parsed.decision,
        parsed.notes,
        req.actor!,
        parsed.expected_version
      );
      res.json(updated);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // PATCH /api/operations/:id - Update parameters with OCC
  const patchSchema = z.object({
    expected_version: z.number().int().positive(),
    title: z.string().min(3).optional(),
    description: z.string().min(5).optional(),
    severity: z.enum(['SEV1_CRITICAL', 'SEV2_HIGH', 'SEV3_MEDIUM', 'SEV4_LOW']).optional(),
    category: z.enum(['SYSTEM_INCIDENT', 'FINANCIAL_TX', 'CUSTOMER_ESCALATION', 'SECURITY_COMPLIANCE', 'INFRA_MAINTENANCE', 'DATA_PIPELINE']).optional(),
    assigned_team_id: z.string().optional(),
    assigned_user_id: z.string().nullable().optional(),
    requires_dual_signoff: z.boolean().optional(),
    metadata: z.record(z.any()).optional()
  });

  router.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = patchSchema.parse(req.body);
      const service = new OperationService(req.db);
      const updated = service.updateDirectiveDetails(
        req.params.id,
        parsed,
        req.actor!,
        parsed.expected_version
      );
      res.json(updated);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations/:id/notes - Add note
  const noteSchema = z.object({
    content: z.string().min(1),
    is_confidential: z.boolean().optional().default(false)
  });

  router.post('/:id/notes', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = noteSchema.parse(req.body);
      const service = new OperationService(req.db);
      const note = service.addNote(
        req.params.id,
        parsed.content,
        parsed.is_confidential,
        req.actor!
      );
      res.status(201).json(note);
    } catch (err) {
      handleRouteErrors(err, res, next);
    }
  });

  // POST /api/operations/:id/presence - Heartbeat
  router.post('/:id/presence', (req: Request, res: Response) => {
    const directiveId = req.params.id;
    const actor = req.actor!;
    StreamHub.recordPresence(directiveId, actor.id, actor.name);
    res.json({ ok: true, active_viewers: StreamHub.getPresence(directiveId) });
  });

  return router;
}

function handleRouteErrors(err: any, res: Response, next: NextFunction) {
  if (err instanceof ConcurrencyConflictError) {
    res.status(409).json({
      error: 'Concurrency conflict detected',
      message: err.message,
      current_version: err.currentVersion,
      current_item: err.currentItem
    });
    return;
  }
  if (err instanceof ValidationError || err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      message: err.message
    });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: 'Forbidden operation',
      message: err.message
    });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: 'Entity not found',
      message: err.message
    });
    return;
  }
  next(err);
}
