import { Inject, Injectable } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { IDatabaseService } from '../database.types';
import { DATABASE_CONNECTION } from '../database.constants';
// eslint-disable-next-line sonarjs/no-wildcard-import
import * as schema from './schemas';

@Injectable()
export class PostgresService implements IDatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  public async dbPing(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }
}
