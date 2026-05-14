import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LuckyDrawService } from './lucky-draw.service';

@ApiTags('lucky-draw')
@Controller('lucky-draw')
export class LuckyDrawHomeController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Get('home-status')
  @ApiOperation({
    summary: '홈 상태 조회',
    description: `홈 화면 진입 시 호출합니다. 오늘 남은 당첨 슬롯, 운영 여부, 화면에 표시할 텍스트를 반환합니다.

**당첨 방식:**
- \`guaranteed_win_available: true\` → 선착순 100% 당첨 구간 (남은 슬롯 있음)
- \`random_available: true\` → 선착순 마감 후 랜덤 당첨 구간 (\`random_win_rate_after_limit\` 확률)
- \`is_open: false\` → 운영 시간 외 (응모 불가)

**서버 시간:** \`server_time\`은 KST 기준. 클라이언트 시계 대신 이 값을 사용하세요.`,
  })
  @ApiResponse({
    status: 200,
    description: '홈 상태 정보 반환',
    schema: {
      example: {
        daily_winner_limit: 100,
        used_winner_slots: 32,
        remaining_winner_slots: 68,
        guaranteed_win_available: true,
        random_available: false,
        random_win_rate_after_limit: 0.2,
        is_open: true,
        popup_text: '100% 당첨 68명 남음!',
        hero_title: '단돈 990원으로 상품타자!',
        hero_subtitle: '400개 이상의 상품이 준비되어 있다고..?',
        speech_bubble_text: '욜영, 치킨, 베라, 떡볶이, 커피.. 대동제 부스 쿠폰까지 준다구?!',
        cta_text: '응모하기',
        server_time: '2026-05-15T10:30:00+09:00',
      },
    },
  })
  getHomeStatus() {
    return this.luckyDrawService.getHomeStatus();
  }
}
