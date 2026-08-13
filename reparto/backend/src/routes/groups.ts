import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware, hasAnyRole } from '../middleware/auth';
import {
  authOrGroupToken,
  generateAccessToken,
  signGroupSessionToken,
} from '../middleware/groupToken';
import { resolveGroupByToken, memberHasActiveExpenseReferences } from '../db/queries';
import {
  createGroupSchema,
  byTokenSchema,
  createMemberSchema,
  updateMemberSchema,
  updateGroupSchema,
} from '../schemas/group.schema';

const MANAGER_ROLES = ['admin', 'reparto_admin'];
const READ_ROLES = ['admin', 'reparto_admin', 'reparto_invitado'];

interface GroupRow {
  id: string;
  name: string;
  access_token: string;
  manager_keycloak_user_id: string;
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * DTO de grupo para el cliente. El `access_token` NUNCA se incluye salvo que
 * `includeToken` sea true (solo el gestor Keycloak lo ve, spec.md "Shareable
 * group access link" — "nunca se devuelve en ningún listado").
 */
function toGroupDto(row: GroupRow, includeToken: boolean) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeToken ? { accessToken: row.access_token } : {}),
  };
}

interface MemberRow {
  id: string;
  group_id: string;
  name: string;
  keycloak_user_id: string | null;
  activo: boolean;
  deleted_at: string | null;
  created_at: string;
}

function toMemberDto(row: MemberRow) {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

/** True cuando la petición llega autenticada como gestor Keycloak (no vía token de grupo). */
function isManagerRequest(request: FastifyRequest): boolean {
  return !!request.user && hasAnyRole(request.user, MANAGER_ROLES);
}

export async function groupsRoutes(app: FastifyInstance): Promise<void> {
  // POST /groups — alta de grupo (gestor Keycloak)
  app.post('/groups', { preHandler: authMiddleware(MANAGER_ROLES) }, async (request, reply: FastifyReply) => {
    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    const managerId = request.user?.sub;
    if (!managerId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const accessToken = generateAccessToken();
      const result = await pool.query<GroupRow>(
        `INSERT INTO "group" (name, access_token, manager_keycloak_user_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [parsed.data.name, accessToken, managerId],
      );
      return reply.code(201).send(toGroupDto(result.rows[0], true));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /groups — listado (gestor Keycloak, admin/reparto_admin/reparto_invitado)
  app.get('/groups', { preHandler: authMiddleware(READ_ROLES) }, async (_request, reply: FastifyReply) => {
    try {
      const result = await pool.query<GroupRow>('SELECT * FROM "group" WHERE activo = true ORDER BY created_at DESC');
      return reply.send(result.rows.map((r) => toGroupDto(r, false)));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // POST /groups/by-token — resuelve el enlace de acceso a una sesión de grupo (público, sin JWT)
  app.post('/groups/by-token', async (request, reply: FastifyReply) => {
    const parsed = byTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
    }
    try {
      const group = await resolveGroupByToken(parsed.data.token);
      if (!group) {
        return reply.code(404).send({ error: 'Enlace de grupo no válido', statusCode: 404 });
      }
      const sessionToken = signGroupSessionToken(group.id);
      return reply.send({ groupId: group.id, groupName: group.name, sessionToken });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /groups/:id — detalle (gestor Keycloak o token de grupo válido para :id)
  app.get<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: authOrGroupToken('id', READ_ROLES) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query<GroupRow>('SELECT * FROM "group" WHERE id = $1 AND activo = true', [id]);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Grupo no encontrado', statusCode: 404 });
        }
        const membersResult = await pool.query<MemberRow>(
          'SELECT * FROM group_member WHERE group_id = $1 AND activo = true ORDER BY created_at ASC',
          [id],
        );
        return reply.send({
          ...toGroupDto(result.rows[0], isManagerRequest(request)),
          members: membersResult.rows.map(toMemberDto),
        });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PATCH /groups/:id — renombrar grupo (gestor o token de grupo, mismo nivel que renombrar miembro)
  app.patch<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      const parsed = updateGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      try {
        const result = await pool.query<GroupRow>(
          'UPDATE "group" SET name = $2 WHERE id = $1 AND activo = true RETURNING *',
          [id, parsed.data.name],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Grupo no encontrado', statusCode: 404 });
        }
        return reply.send(toGroupDto(result.rows[0], isManagerRequest(request)));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /groups/:id — soft delete (solo gestor Keycloak)
  app.delete<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: authMiddleware(MANAGER_ROLES) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query(
          'UPDATE "group" SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING id',
          [id],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Grupo no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // POST /groups/:id/rotate-token — regenera el access_token (solo gestor Keycloak)
  app.post<{ Params: { id: string } }>(
    '/groups/:id/rotate-token',
    { preHandler: authMiddleware(MANAGER_ROLES) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const newToken = generateAccessToken();
        const result = await pool.query<GroupRow>(
          'UPDATE "group" SET access_token = $2 WHERE id = $1 AND activo = true RETURNING *',
          [id, newToken],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Grupo no encontrado', statusCode: 404 });
        }
        return reply.send({ accessToken: result.rows[0].access_token });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /groups/:id/members — listado de miembros activos
  app.get<{ Params: { id: string } }>(
    '/groups/:id/members',
    { preHandler: authOrGroupToken('id', READ_ROLES) },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const result = await pool.query<MemberRow>(
          'SELECT * FROM group_member WHERE group_id = $1 AND activo = true ORDER BY created_at ASC',
          [id],
        );
        return reply.send(result.rows.map(toMemberDto));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // POST /groups/:id/members — alta de miembro por nombre libre, sin cuenta (gestor o token de grupo)
  app.post<{ Params: { id: string } }>(
    '/groups/:id/members',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      const parsed = createMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      try {
        const groupCheck = await pool.query('SELECT id FROM "group" WHERE id = $1 AND activo = true', [id]);
        if (groupCheck.rows.length === 0) {
          return reply.code(404).send({ error: 'Grupo no encontrado', statusCode: 404 });
        }
        const result = await pool.query<MemberRow>(
          'INSERT INTO group_member (group_id, name) VALUES ($1, $2) RETURNING *',
          [id, parsed.data.name],
        );
        return reply.code(201).send(toMemberDto(result.rows[0]));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PATCH /groups/:id/members/:memberId — renombrar miembro (gestor o token de grupo)
  app.patch<{ Params: { id: string; memberId: string } }>(
    '/groups/:id/members/:memberId',
    { preHandler: authOrGroupToken('id') },
    async (request, reply: FastifyReply) => {
      const { id, memberId } = request.params;
      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      try {
        const result = await pool.query<MemberRow>(
          'UPDATE group_member SET name = $3 WHERE id = $2 AND group_id = $1 AND activo = true RETURNING *',
          [id, memberId, parsed.data.name],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Miembro no encontrado', statusCode: 404 });
        }
        return reply.send(toMemberDto(result.rows[0]));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /groups/:id/members/:memberId — soft delete (solo gestor Keycloak),
  // bloqueado mientras el miembro esté referenciado en un gasto activo
  app.delete<{ Params: { id: string; memberId: string } }>(
    '/groups/:id/members/:memberId',
    { preHandler: authMiddleware(MANAGER_ROLES) },
    async (request, reply: FastifyReply) => {
      const { id, memberId } = request.params;
      try {
        const referenced = await memberHasActiveExpenseReferences(id, memberId);
        if (referenced) {
          return reply.code(400).send({
            error: 'No se puede eliminar: el miembro está referenciado en gastos activos del grupo',
            statusCode: 400,
          });
        }
        const result = await pool.query(
          'UPDATE group_member SET activo = false, deleted_at = NOW() WHERE id = $2 AND group_id = $1 AND activo = true RETURNING id',
          [id, memberId],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Miembro no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
