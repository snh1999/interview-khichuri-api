import { Module } from '@nestjs/common';
import { LookupsService } from './lookups.service';
import { LookupsController } from './lookups.controller';

@Module({
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
