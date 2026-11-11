import { Module } from '@nestjs/common';
import { AuditPartitionsJob } from './audit-partitions.job.js';
import { NotificationDeliveryJob } from './notification-delivery.job.js';

/** Background jobs (DECISIONS D-041). In-process cron; notification delivery uses a database outbox, not BullMQ (D-071). */
@Module({
  providers: [AuditPartitionsJob, NotificationDeliveryJob],
})
export class JobsModule {}
