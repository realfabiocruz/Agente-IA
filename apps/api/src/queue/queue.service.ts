import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PgBoss = require('pg-boss');

export const EVALUATE_QUEUE = 'evaluate-interview';

/** Fila sobre o próprio Postgres (pg-boss), sem Redis. */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss!: PgBoss;
  private ready!: Promise<void>;

  onModuleInit() {
    this.boss = new PgBoss(process.env.DATABASE_URL!);
    this.boss.on('error', (err) => this.logger.error(err));
    this.ready = this.boss.start().then(async () => {
      await this.boss.createQueue(EVALUATE_QUEUE, { retryLimit: 2, retryDelay: 30 });
    });
    return this.ready;
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  async send(name: string, data: object) {
    await this.ready;
    return this.boss.send(name, data);
  }

  async work<T>(name: string, handler: (data: T) => Promise<void>) {
    await this.ready;
    await this.boss.work<T>(name, async (jobs) => {
      for (const job of jobs) await handler(job.data);
    });
  }
}
