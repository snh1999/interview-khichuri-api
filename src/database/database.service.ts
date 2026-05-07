import { Inject, Injectable } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DATABASE_CONNECTION } from './database.constants';
// eslint-disable-next-line sonarjs/no-wildcard-import
import * as schema from './postgres/schemas';

@Injectable()
export class DatabaseService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    public readonly db: PostgresJsDatabase<typeof schema>,
  ) {}
}
