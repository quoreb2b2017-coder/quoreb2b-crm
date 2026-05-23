import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';

@Controller({ path: 'roles', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  @Roles(SystemRole.SUPER_ADMIN)
  findAll(@Query() dto: PaginationDto) {
    return this.rolesService.findAll(dto);
  }

  @Post()
  @Roles(SystemRole.SUPER_ADMIN)
  create(@Body() body: { name: string; description?: string; permissions?: string[] }) {
    return this.rolesService.create(body);
  }
}
