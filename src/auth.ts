import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';

const JWT_SECRET = process.env.JWT_SECRET || 'delupo-secret-key-change-in-production';

export interface AuthPayload {
  userId: string;
  username: string;
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Token não fornecido' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    // Adicionar dados do usuário ao request
    (request as any).user = payload;
  } catch (error) {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
}
