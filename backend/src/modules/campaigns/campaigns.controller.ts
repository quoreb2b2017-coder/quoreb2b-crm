import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { CampaignsService } from './campaigns.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller({ path: 'campaigns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() dto: PaginationDto, @CurrentUser('id') userId: string) {
    return this.campaignsService.findAll(dto, userId);
  }

  @Post()
  create(@Body() body: { name: string; channel?: string }, @CurrentUser('id') userId: string) {
    return this.campaignsService.create({
      ...body,
      clientId: new Types.ObjectId(userId),
    });
  }
}
