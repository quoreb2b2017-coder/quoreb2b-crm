import { Controller, Post, Get, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { ApplyLeaveDto, LeaveQueryDto } from './dto/leave.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('leave')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private leaveService: LeaveService) {}

  @Post('apply')
  async applyLeave(@Body() dto: ApplyLeaveDto) {
    return this.leaveService.applyLeave(dto);
  }

  @Get('applications')
  async getLeaveApplications(@Query() query: LeaveQueryDto) {
    return this.leaveService.getLeaveApplications(query);
  }

  @Get('my-leaves')
  async getMyLeaves(@Req() req: any, @Query('status') status?: string) {
    return this.leaveService.getUserLeaves(req.user.id, status);
  }

  @Get('balances/:year')
  async getLeaveBalances(
    @Req() req: any,
    @Param('year') year: string,
    @Query('userIds') userIds?: string,
  ) {
    const ids = userIds
      ? userIds.split(',').map((id) => id.trim()).filter(Boolean)
      : [];
    return this.leaveService.getLeaveBalancesForUsers(
      req.user.id,
      req.user.roles ?? [],
      parseInt(year, 10),
      ids,
    );
  }

  @Get('balance/:year')
  async getLeaveBalance(@Req() req: any, @Param('year') year: string) {
    return this.leaveService.getLeaveBalance(req.user.id, parseInt(year, 10));
  }

  @Post(':leaveId/approve')
  async approveLeave(@Param('leaveId') leaveId: string, @Req() req: any) {
    return this.leaveService.approveLeave(leaveId, req.user.id);
  }

  @Post(':leaveId/reject')
  async rejectLeave(@Param('leaveId') leaveId: string, @Body('rejectionReason') rejectionReason: string) {
    return this.leaveService.rejectLeave(leaveId, rejectionReason);
  }
}
