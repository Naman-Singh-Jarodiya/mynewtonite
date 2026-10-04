import { Response } from 'express';

interface PresenceRecord {
  userId: string;
  userName: string;
  lastHeartbeat: number;
}

export class StreamHub {
  private static clients: Set<{ res: Response; userId: string }> = new Set();
  private static presenceMap: Map<string, Map<string, PresenceRecord>> = new Map();

  static registerClient(res: Response, userId: string): void {
    const client = { res, userId };
    this.clients.add(client);

    res.on('close', () => {
      this.clients.delete(client);
    });
  }

  static broadcast(eventName: string, payload: any): void {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(message);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  static recordPresence(directiveId: string, userId: string, userName: string): void {
    if (!this.presenceMap.has(directiveId)) {
      this.presenceMap.set(directiveId, new Map());
    }
    const directivePresence = this.presenceMap.get(directiveId)!;
    directivePresence.set(userId, {
      userId,
      userName,
      lastHeartbeat: Date.now()
    });

    // Broadcast presence update
    this.broadcast('PRESENCE_UPDATED', {
      directiveId,
      viewers: this.getPresence(directiveId)
    });
  }

  static getPresence(directiveId: string): { userId: string; userName: string }[] {
    const directivePresence = this.presenceMap.get(directiveId);
    if (!directivePresence) return [];

    const now = Date.now();
    const activeViewers: { userId: string; userName: string }[] = [];

    // Expire heartbeats older than 30 seconds
    for (const [userId, record] of directivePresence.entries()) {
      if (now - record.lastHeartbeat < 30000) {
        activeViewers.push({ userId: record.userId, userName: record.userName });
      } else {
        directivePresence.delete(userId);
      }
    }

    return activeViewers;
  }

  static getActiveClientsCount(): number {
    return this.clients.size;
  }
}
