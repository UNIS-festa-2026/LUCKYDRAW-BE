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
    summary: '응모 생성 + 결과 즉시 반환',
    description: `계좌이체 결제 후 럭키드로우에 응모합니다. 응모와 동시에 당첨 결과가 즉시 반환됩니다.

**운영 시간:** 매일 09:00~20:00 KST

**중복 방지:** \`session_id\` 전달 시 5초 내 동일 세션 중복 응모 차단

**결과 타입별 처리:**
- \`result: LOSE\` → 낙첨 화면 표시
- \`result: WIN\` + \`prize.type: BOOTH_COUPON\` → \`coupon.url\`로 이동 (부스 쿠폰 화면). URL은 \`PUBLIC_COUPON_BASE_URL/{token}\` 형태로 자동 생성. Google Sheets 자동 기록.
- \`result: WIN\` + \`prize.type: DIGITAL_COUPON | ETC\` → 당첨자 정보 입력 안내 후 운영자가 수동 발송 (Google Sheets에서 확인)

**WIN 시 다음 단계:** \`next_action: INPUT_WINNER_INFO\` → \`POST /entries/:entryId/winner-info\` 호출`,
  })
  @ApiResponse({
    status: 201,
    description: '응모 성공',
    schema: {
      oneOf: [
        {
          title: '낙첨',
          example: {
            entry_id: 'uuid-here',
            result: 'LOSE',
            title: '아쉽지만 다음 기회에..',
            message: '매일 9시~20시 동안 도전할 수 있어요!',
            retry_available: true,
            share_url: '/lucky-draw',
          },
        },
        {
          title: '당첨 (부스 쿠폰)',
          example: {
            entry_id: 'uuid-here',
            result: 'WIN',
            title: '당첨!!',
            prize: {
              prize_id: 'uuid-here',
              type: 'BOOTH_COUPON',
              name: '베라 싱글레귤러',
              image_url: 'https://...',
              delivery_type: 'BOOTH_COUPON',
            },
            winner_info_required: true,
            next_action: 'INPUT_WINNER_INFO',
            coupon: {
              coupon_id: 'uuid-here',
              token: 'abc123',
              url: 'https://example.com/coupons/abc123',
            },
          },
        },
        {
          title: '당첨 (디지털/기타)',
          example: {
            entry_id: 'uuid-here',
            result: 'WIN',
            title: '당첨!!',
            prize: {
              prize_id: 'uuid-here',
              type: 'DIGITAL_COUPON',
              name: '욜영 1만원권',
              image_url: 'https://...',
              delivery_type: 'MANUAL_SEND',
            },
            winner_info_required: true,
            next_action: 'INPUT_WINNER_INFO',
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
    description: `당첨된 응모에 수령인 정보(이름, 전화번호, 한 줄 후기)를 등록합니다.

등록 완료 시 Google Sheets \`winner_infos\` 탭에 자동 기록됩니다.
운영자는 Sheets에서 \`DIGITAL_COUPON / ETC\` 당첨자 정보를 확인 후 수동 발송합니다.

**전화번호 형식:** 숫자만 입력 (하이픈 제거 후 저장). 010으로 시작하는 11자리만 허용.
**한 줄 후기:** 공백 제거 후 1~100자`,
  })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({
    status: 201,
    description: '당첨자 정보 등록 성공',
    schema: {
      example: {
        entry_id: 'uuid-here',
        winner_info_id: 'uuid-here',
        name: '홍길동',
        phone: '01012345678',
        review: '재미있었어요!',
        delivery_status: 'PENDING',
        created_at: '2026-05-15T10:30:00.000Z',
        next_action: 'SHOW_DELIVERY_GUIDE',
      },
    },
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

  @Get(':entryId/winner-info')
  @ApiOperation({ summary: '당첨자 정보 조회', description: '등록된 당첨자 정보를 조회합니다.' })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({
    status: 200,
    description: '당첨자 정보 반환',
    schema: {
      oneOf: [
        {
          title: '미등록',
          example: {
            entry_id: 'uuid-here',
            is_submitted: false,
            message: '아직 당첨자 정보가 입력되지 않았습니다.',
          },
        },
        {
          title: '등록됨',
          example: {
            entry_id: 'uuid-here',
            winner_info_id: 'uuid-here',
            name: '홍길동',
            phone: '01012345678',
            review: '재미있었어요!',
            delivery_status: 'PENDING',
            created_at: '2026-05-15T10:30:00.000Z',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 403, description: '당첨된 응모가 아님', schema: { example: { error: 'NOT_WINNER', message: '당첨된 응모가 아닙니다.' } } })
  @ApiResponse({ status: 404, description: '응모 내역 없음', schema: { example: { error: 'ENTRY_NOT_FOUND', message: '응모 내역을 찾을 수 없습니다.' } } })
  getWinnerInfo(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getWinnerInfo(entryId);
  }
}
