import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateWinnerInfoDto } from './dto/create-winner-info.dto';
import { LuckyDrawService } from './lucky-draw.service';

@Controller('lucky-draw/entries')
export class LuckyDrawController {
  constructor(private readonly luckyDrawService: LuckyDrawService) {}

  @Post()
  createEntry(@Body() body: CreateEntryDto) {
    return this.luckyDrawService.createEntry(body);
  }

  @Get(':entryId/result')
  getResult(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getResult(entryId);
  }

  @Post(':entryId/winner-info')
  createWinnerInfo(
    @Param('entryId') entryId: string,
    @Body() body: CreateWinnerInfoDto,
  ) {
    return this.luckyDrawService.createWinnerInfo(entryId, body);
  }

  @Get(':entryId/winner-info')
  getWinnerInfo(@Param('entryId') entryId: string) {
    return this.luckyDrawService.getWinnerInfo(entryId);
  }
}
