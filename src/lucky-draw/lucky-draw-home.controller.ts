import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LuckyDrawService } from './lucky-draw.service';

@ApiTags('lucky-draw')
@Controller('lucky-draw')
export class LuckyDrawHomeController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Get('home-status')
  @ApiOperation({ summary: '홈 상태 조회', description: '오늘 남은 당첨 슬롯, 운영 여부, 화면 텍스트 등을 반환합니다.' })
  @ApiResponse({ status: 200, description: '홈 상태 정보 반환' })
  getHomeStatus() {
    return this.luckyDrawService.getHomeStatus();
  }
}
