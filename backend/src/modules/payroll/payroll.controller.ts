import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemRole } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  GeneratePayslipDto,
  ListPayslipsQueryDto,
  UpdatePayrollBrandingDto,
  UpsertCompensationDto,
} from './dto/payroll.dto';

type AuthUser = { id?: string; sub?: string; roles?: string[] };

@Controller({ path: 'payroll', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  private uid(user: AuthUser): string {
    return user.id ?? user.sub ?? '';
  }

  private roles(user: AuthUser): string[] {
    return user.roles ?? [];
  }

  @Get('branding')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  getBranding() {
    return this.payrollService.getBranding();
  }

  @Put('branding')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  updateBranding(@Body() dto: UpdatePayrollBrandingDto) {
    return this.payrollService.updateBranding(dto);
  }

  @Get('compensations')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  listCompensations() {
    return this.payrollService.listCompensations();
  }

  @Put('compensations')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  upsertCompensation(@Body() dto: UpsertCompensationDto) {
    return this.payrollService.upsertCompensation(dto);
  }

  @Get('compensations/:userId')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  getCompensation(@Param('userId') userId: string) {
    return this.payrollService.getCompensation(userId);
  }

  @Post('payslips/generate')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  generate(@CurrentUser() user: AuthUser, @Body() dto: GeneratePayslipDto) {
    return this.payrollService.generatePayslip(dto, this.uid(user));
  }

  @Get('payslips')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  listPayslips(@CurrentUser() user: AuthUser, @Query() query: ListPayslipsQueryDto) {
    return this.payrollService.listPayslips(query, this.uid(user), this.roles(user));
  }

  @Get('payslips/mine')
  @Roles(SystemRole.EMPLOYEE, SystemRole.DB_ADMIN, SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  myPayslip(
    @CurrentUser() user: AuthUser,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    return this.payrollService.getMyPayslipByMonth(this.uid(user), y, m);
  }

  @Get('payslips/:id')
  @Roles(
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  )
  getPayslip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payrollService.getPayslip(id, this.uid(user), this.roles(user));
  }
}
