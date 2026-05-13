import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { IDatabaseService } from '../database.types';
import { DATABASE_CONNECTION } from '../database.constants';
// eslint-disable-next-line sonarjs/no-wildcard-import
import * as schema from './schemas';

@Injectable()
export class SqliteService implements IDatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: BetterSQLite3Database<typeof schema>,
  ) {}

  public dbPing(): void {
    this.db.run(sql`SELECT 1`);
  }
}
