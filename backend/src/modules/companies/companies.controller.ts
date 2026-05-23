import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller({ path: 'companies', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  findAll(@Query() dto: PaginationDto) {
    return this.companiesService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; domain?: string; industry?: string }) {
    return this.companiesService.create(body);
  }
}
