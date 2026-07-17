import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { actorFromJwt } from '../activity-logs/activity-user.util';

@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  findAll(@Query() dto: PaginationDto) {
    return this.usersService.findAll(dto);
  }

  @Get('team-members')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN, SystemRole.DB_ADMIN)
  listTeamMembers(@CurrentUser() user: { roles?: string[] }) {
    return this.usersService.listTeamMembers(user.roles ?? []);
  }

  @Post()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.usersService.createByAdmin(dto, actorFromJwt(user));
  }

  @Get(':id/password')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  async getPassword(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    const password = await this.usersService.getPlainPassword(id, actorFromJwt(user));
    return { password };
  }

  @Post(':id/delete-otp')
  @Roles(SystemRole.SUPER_ADMIN)
  sendDeleteOtp(
    @Param('id') id: string,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.usersService.sendDeleteSuperAdminOtp(id, actorFromJwt(user));
  }

  @Patch(':id/status')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.usersService.setActiveStatus(id, dto.isActive, actorFromJwt(user));
  }

  @Delete(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto = {},
    @CurrentUser() user: Parameters<typeof actorFromJwt>[0],
  ) {
    return this.usersService.deleteManagedUser(id, actorFromJwt(user), { otp: dto?.otp });
  }

  @Get(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
