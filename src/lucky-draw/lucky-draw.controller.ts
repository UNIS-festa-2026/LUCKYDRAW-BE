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
  @ApiResponse({ status: 201, description: '응모 성공. next_action: SHOW_RESULT_LOADING' })
  @ApiResponse({ status: 400, description: '잘못된 결제 방식 또는 금액' })
  @ApiResponse({ status: 403, description: '운영 시간 외 (09:00~20:00 KST)' })
  @ApiResponse({ status: 409, description: '중복 응모 또는 상품 소진' })
  createEntry(@Body() body: CreateEntryDto) {
    return this.luckyDrawService.createEntry(body);
  }

  @Get(':entryId/result')
  @ApiOperation({ summary: '응모 결과 조회', description: '응모 ID로 당첨 결과를 조회합니다.' })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({ status: 200, description: '결과 반환 (result: WIN | LOSE)' })
  @ApiResponse({ status: 404, description: '응모 내역 없음' })
  @ApiResponse({ status: 409, description: '결과 미확정 (잠시 후 재시도)' })
  getResult(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getResult(entryId);
  }

  @Post(':entryId/winner-info')
  @ApiOperation({ summary: '당첨자 정보 등록', description: '당첨된 응모에 수령인 정보를 등록합니다.' })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({ status: 201, description: '당첨자 정보 등록 성공. next_action: SHOW_DELIVERY_GUIDE' })
  @ApiResponse({ status: 403, description: '당첨된 응모가 아님' })
  @ApiResponse({ status: 404, description: '응모 내역 없음' })
  @ApiResponse({ status: 409, description: '이미 정보가 등록된 응모' })
  createWinnerInfo(
    @Param('entryId') entryId: string,
    @Body() body: CreateWinnerInfoDto,
  ) {
    return this.luckyDrawService.createWinnerInfo(entryId, body);
  }

  @Get(':entryId/winner-info')
  @ApiOperation({ summary: '당첨자 정보 조회', description: '등록된 당첨자 정보를 조회합니다.' })
  @ApiParam({ name: 'entryId', description: '응모 UUID' })
  @ApiResponse({ status: 200, description: '당첨자 정보 반환 (미등록 시 is_submitted: false)' })
  @ApiResponse({ status: 403, description: '당첨된 응모가 아님' })
  @ApiResponse({ status: 404, description: '응모 내역 없음' })
  getWinnerInfo(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getWinnerInfo(entryId);
  }
}
