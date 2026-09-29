import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Version-neutral (stays at / rather than /v1) — a root route like this
  // is the kind of thing an uptime check or a Render health check could
  // reasonably be pointed at by a fixed URL outside this codebase.
  @Get()
  @Version(VERSION_NEUTRAL)
  getHello(): string {
    return this.appService.getHello();
  }
}
