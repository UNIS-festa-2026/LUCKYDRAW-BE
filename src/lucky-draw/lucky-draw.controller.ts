import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateWinnerInfoDto } from './dto/create-winner-info.dto';
import { LuckyDrawService } from './lucky-draw.service';

@ApiTags('lucky-draw')
@Controller('lucky-draw/entries')
export class LuckyDrawController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Post()
  @ApiOperation({
    summary: '응모 + 결과 즉시 반환',
    description: `**전체 플로우**

\`\`\`
[송금 완료 버튼]
  → POST /api/lucky-draw/entries    ← 이 API (로딩 중 호출)
  → result: LOSE  → 낙첨 화면
  → result: WIN   → 당첨 화면 (prize.image_url 표시)
                    → 이름 / 전화번호 / 한 줄 후기 입력
                    → POST /api/lucky-draw/entries/:entryId/winner-info
                    → prize.type === 'BOOTH'  → 전달 예정 안내 (운영자가 부스 쿠폰 직접 배포)
                    → prize.type === 'UNIS'   → 전달 예정 안내 (운영자가 자체 쿠폰 수동 발송)
\`\`\`

**주의사항**
- 결과는 이 API 한 번으로 즉시 반환됨 — 폴링 불필요
- 당첨 화면 쿠폰 이미지는 \`prize.image_url\` 사용
- \`prize.type\`: \`BOOTH\` (부스 쿠폰) | \`UNIS\` (자체 쿠폰) — 두 타입 모두 당첨자 정보 입력 후 운영자 수동 배포

**운영 시간:** 매일 09:00 ~ 20:00 KST

**중복 방지:** \`session_id\` 전달 시 5초 내 동일 세션 재요청 차단

---

**당첨 쿠폰 목록**

\`prize.type: BOOTH\` (부스 쿠폰)
| 부스명 | 수량 |
|---|---|
| 이화검도부 | 50장 |
| EMC | 50장 |
| 일반대학원 총학생회 | 50장 |
| 중앙스트릿댄스동아리 ACTION | 50장 |
| 융합보건학과 학생회 VITAL | 50장 |
| 디자인학부 학생회 | 40장 |
| AIESEC | 30장 |
| 인문과학대학 학생회 리베라리음 | 30장 |
| 중어중문학과 학생회 전진중문 | 30장 (20일 15장 / 21일 15장) |

\`prize.type: UNIS\` (자체 쿠폰)
| 쿠폰명 | 수량 |
|---|---|
| BBQ 황올 | 2개 |
| 컴포즈 아이스 아메리카노 | 10~25개 |
| 베라 아이스크림 싱글레귤러 | 9~10개 |
| 청년다방 떡볶이 | 2개 |
| 올리브영 기프트카드 3만원 | 2개 |`,
  })
  @ApiResponse({
    status: 201,
    description: '응모 성공',
    schema: {
      oneOf: [
        {
          title: '낙첨',
          example: { result: 'LOSE' },
        },
        {
          title: '당첨 (부스 쿠폰)',
          example: {
            entry_id: 'uuid-here',
            result: 'WIN',
            prize: { type: 'BOOTH', name: '이화검도부 1000원 할인권', image_url: 'https://...' },
          },
        },
        {
          title: '당첨 (자체 쿠폰)',
          example: {
            entry_id: 'uuid-here',
            result: 'WIN',
            prize: { type: 'UNIS', name: '스타벅스 5000원권', image_url: 'https://...' },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: '잘못된 결제 방식 또는 금액', schema: { example: { error: 'INVALID_AMOUNT', message: '응모 금액이 올바르지 않습니다.' } } })
  @ApiResponse({ status: 403, description: '운영 시간 외 (09:00~20:00 KST)', schema: { example: { error: 'LUCKY_DRAW_CLOSED', message: '현재 응모 가능 시간이 아닙니다.' } } })
  @ApiResponse({ status: 409, description: '중복 응모 또는 상품 소진', schema: { example: { error: 'DUPLICATE_ENTRY', message: '이미 처리 중인 응모가 있습니다.' } } })
  createEntry(@Body() body: CreateEntryDto) {
    return this.luckyDrawService.createEntry(body);
  }

  @Post(':entryId/winner-info')
  @ApiOperation({
    summary: '당첨자 정보 등록',
    description: `당첨 화면에서 이름 / 전화번호 / 한 줄 후기 입력 완료 시 호출합니다.

**등록 후 처리**
- 두 타입 모두 전달 예정 안내 화면 표시
- 운영자가 Google Sheets \`winner_infos\` 탭에서 확인 후 배포 (\`BOOTH\`: 부스 쿠폰 직접 배포 / \`UNIS\`: 자체 쿠폰 수동 발송)

**유효성 검사**
- 전화번호: 숫자만 허용, 010으로 시작하는 11자리
- 한 줄 후기: 앞뒤 공백 제거 후 1 ~ 100자
- 이름: 앞뒤 공백 제거 후 1 ~ 20자`,
  })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({
    status: 201,
    description: '당첨자 정보 등록 성공',
    schema: { example: {} },
  })
  @ApiResponse({ status: 403, description: '당첨된 응모가 아님', schema: { example: { error: 'NOT_WINNER', message: '당첨된 응모가 아닙니다.' } } })
  @ApiResponse({ status: 404, description: '응모 내역 없음', schema: { example: { error: 'ENTRY_NOT_FOUND', message: '응모 내역을 찾을 수 없습니다.' } } })
  @ApiResponse({ status: 409, description: '이미 정보가 등록된 응모', schema: { example: { error: 'WINNER_INFO_ALREADY_SUBMITTED', message: '이미 당첨자 정보가 입력되었습니다.' } } })
  createWinnerInfo(
    @Param('entryId') entryId: string,
    @Body() body: CreateWinnerInfoDto,
  ) {
    return this.luckyDrawService.createWinnerInfo(entryId, body);
  }

}
