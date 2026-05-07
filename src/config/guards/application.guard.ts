import { Injectable, CanActivate } from '@nestjs/common';

@Injectable()
export class ApplicationGuard implements CanActivate {
  public canActivate(): boolean {
    return true;
  }
}
