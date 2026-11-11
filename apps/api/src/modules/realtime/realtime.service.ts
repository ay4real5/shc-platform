import { Injectable, Logger } from '@nestjs/common';
import { NotificationsGateway, userRoom } from './realtime.gateways.js';

/**
 * The one place that pushes to sockets. Emitting never throws: a failed push must not fail the request that caused
 * it (the data is in the database; clients catch up when they reconnect or refetch).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly notifications: NotificationsGateway) {}

  /** Per-user pushes. `message:new` carries IDs only; the client fetches the text (D-057). */
  toUser(userId: string, event: 'notification:new' | 'message:new', payload: unknown): void {
    this.safely(() => this.notifications.server?.to(userRoom(userId)).emit(event, payload));
  }

  private safely(send: () => unknown): void {
    try {
      send();
    } catch (error) {
      this.logger.warn(
        `realtime emit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
