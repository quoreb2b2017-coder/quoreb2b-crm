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

  @Get('balance/:year')
  async getLeaveBalance(@Req() req: any, @Param('year') year: string) {
    return this.leaveService.getLeaveBalance(req.user.id, parseInt(year));
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
