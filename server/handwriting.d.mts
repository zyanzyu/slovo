import type { IncomingMessage, ServerResponse } from 'node:http';

export function handwritingMiddleware(req: IncomingMessage, res: ServerResponse): Promise<void>;
