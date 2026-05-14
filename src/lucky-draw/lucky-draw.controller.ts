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
  @ApiOperation({ summary: '응모 생성', description: '계좌이체 결제 후 럭키드로우에 응모합니다.' })
  @ApiResponse({
    status: 201,
    description: '응모 성공',
    schema: {
      example: {
        entry_id: 'uuid-here',
        status: 'PENDING',
        amount: 990,
        result: 'WIN',
        created_at: '2026-05-15T10:30:00.000Z',
        next_action: 'SHOW_RESULT_LOADING',
      },
    },
  })
  @ApiResponse({ status: 400, description: '잘못된 결제 방식 또는 금액', schema: { example: { error: 'INVALID_AMOUNT', message: '응모 금액이 올바르지 않습니다.' } } })
  @ApiResponse({ status: 403, description: '운영 시간 외 (09:00~20:00 KST)', schema: { example: { error: 'LUCKY_DRAW_CLOSED', message: '현재 응모 가능 시간이 아닙니다.' } } })
  @ApiResponse({ status: 409, description: '중복 응모 또는 상품 소진', schema: { example: { error: 'DUPLICATE_ENTRY', message: '이미 처리 중인 응모가 있습니다.' } } })
  createEntry(@Body() body: CreateEntryDto) {
    return this.luckyDrawService.createEntry(body);
  }

  @Get(':entryId/result')
  @ApiOperation({ summary: '응모 결과 조회', description: '응모 ID로 당첨 결과를 조회합니다.' })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({
    status: 200,
    description: '결과 반환',
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
          title: '당첨',
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
      ],
    },
  })
  @ApiResponse({ status: 404, description: '응모 내역 없음', schema: { example: { error: 'ENTRY_NOT_FOUND', message: '응모 내역을 찾을 수 없습니다.' } } })
  @ApiResponse({ status: 409, description: '결과 미확정 (잠시 후 재시도)', schema: { example: { error: 'RESULT_NOT_CONFIRMED', message: '아직 결과가 확정되지 않았습니다.' } } })
  getResult(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getResult(entryId);
  }

  @Post(':entryId/winner-info')
  @ApiOperation({ summary: '당첨자 정보 등록', description: '당첨된 응모에 수령인 정보를 등록합니다.' })
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
