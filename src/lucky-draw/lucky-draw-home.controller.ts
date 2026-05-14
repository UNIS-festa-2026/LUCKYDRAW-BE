import { Controller, Get } from '@nestjs/common';
import { LuckyDrawService } from './lucky-draw.service';

@Controller('lucky-draw')
export class LuckyDrawHomeController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Get('home-status')
  getHomeStatus() {
    return this.luckyDrawService.getHomeStatus();
  }
}
