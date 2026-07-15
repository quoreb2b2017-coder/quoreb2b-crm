import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EmployeeCompensation,
  EmployeeCompensationSchema,
} from './schemas/employee-compensation.schema';
import { Payslip, PayslipSchema } from './schemas/payslip.schema';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    SettingsModule,
    UsersModule,
    AttendanceModule,
    MongooseModule.forFeature([
      { name: EmployeeCompensation.name, schema: EmployeeCompensationSchema },
      { name: Payslip.name, schema: PayslipSchema },
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
