import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LuckyDrawService } from './lucky-draw.service';

@ApiTags('lucky-draw')
@Controller('lucky-draw')
export class LuckyDrawHomeController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Get('home')
  @ApiOperation({
    summary: '홈 화면 데이터 조회',
    description: `홈 화면 진입 시 한 번 호출합니다. 상태 정보 + 후기 목록을 함께 반환합니다.

- \`is_open\`: 운영 시간 여부 (09:00~20:00 KST), false면 응모 버튼 비활성화
- \`remaining_winner_slots\`: 선착순 당첨 잔여 수, 0이면 랜덤 당첨 구간`,
  })
  @ApiResponse({
    status: 200,
    description: '홈 화면 데이터 반환',
    schema: {
      example: {
        is_open: true,
        remaining_winner_slots: 68,
        reviews: [
          { masked_name: '김*민', review: '와 저 진짜 당첨됐어요!!!' },
          { masked_name: '이*서', review: '우와 맛있게 먹을게요~' },
        ],
      },
    },
  })
  getHome() {
    return this.luckyDrawService.getHome();
  }
}
