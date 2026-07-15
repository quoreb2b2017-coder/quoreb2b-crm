import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmployeeCompensation } from './schemas/employee-compensation.schema';
import { Payslip } from './schemas/payslip.schema';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { AttendanceService } from '../attendance/attendance.service';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  DEFAULT_PAYROLL_BRANDING,
  MONTH_NAMES,
  PAYROLL_BRANDING_KEY,
  type PayrollBranding,
} from './payroll.constants';
import type {
  GeneratePayslipDto,
  ListPayslipsQueryDto,
  UpdatePayrollBrandingDto,
  UpsertCompensationDto,
} from './dto/payroll.dto';

const MAX_DATA_URL_CHARS = 1_800_000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function assertDataUrl(value: string | undefined, field: string) {
  if (!value) return;
  if (!value.startsWith('data:image/')) {
    throw new BadRequestException(`${field} must be an image data URL`);
  }
  if (value.length > MAX_DATA_URL_CHARS) {
    throw new BadRequestException(`${field} is too large (max ~1.5 MB)`);
  }
}

/** Simple Indian-style amount in words for professional slips. */
export function amountInWordsInr(amount: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
  };

  const threeDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 100) return twoDigits(n);
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`.trim();
  };

  const rupees = Math.floor(Math.max(0, amount));
  const paise = Math.round((Math.max(0, amount) - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let n = rupees;
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  let words = `${parts.join(' ')} Rupees`.trim();
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(EmployeeCompensation.name)
    private readonly compensations: Model<EmployeeCompensation>,
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
    private readonly settings: SettingsService,
    private readonly usersService: UsersService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async getBranding(): Promise<PayrollBranding> {
    const row = await this.settings.get(PAYROLL_BRANDING_KEY);
    const value = (row?.value ?? {}) as Partial<PayrollBranding>;
    return { ...DEFAULT_PAYROLL_BRANDING, ...value };
  }

  async updateBranding(dto: UpdatePayrollBrandingDto): Promise<PayrollBranding> {
    const current = await this.getBranding();
    assertDataUrl(dto.logoDataUrl, 'logo');
    assertDataUrl(dto.signDataUrl, 'sign');
    assertDataUrl(dto.stampDataUrl, 'stamp');

    const next: PayrollBranding = {
      ...current,
      companyName: dto.companyName?.trim() || current.companyName || 'QuoreB2B CRM',
      companyAddress:
        dto.companyAddress !== undefined ? dto.companyAddress.trim() : current.companyAddress,
      companyEmail:
        dto.companyEmail !== undefined ? dto.companyEmail.trim() : current.companyEmail,
      companyPhone:
        dto.companyPhone !== undefined ? dto.companyPhone.trim() : current.companyPhone,
      authorizedSignatoryName:
        dto.authorizedSignatoryName !== undefined
          ? dto.authorizedSignatoryName.trim()
          : current.authorizedSignatoryName,
      authorizedSignatoryTitle:
        dto.authorizedSignatoryTitle !== undefined
          ? dto.authorizedSignatoryTitle.trim()
          : current.authorizedSignatoryTitle,
      logoDataUrl: dto.clearLogo ? undefined : dto.logoDataUrl ?? current.logoDataUrl,
      signDataUrl: dto.clearSign ? undefined : dto.signDataUrl ?? current.signDataUrl,
      stampDataUrl: dto.clearStamp ? undefined : dto.stampDataUrl ?? current.stampDataUrl,
    };

    await this.settings.set(PAYROLL_BRANDING_KEY, next, 'payroll');
    return next;
  }

  async listCompensations() {
    const rows = await this.compensations.find({ isActive: true }).lean().exec();
    const ids = rows.map((r) => r.userId);
    const users = await this.usersService.findUsersByIds(ids);
    const userMap = new Map(users.map((u) => [u.id, u]));
    return {
      data: rows.map((r) => {
        const u = userMap.get(r.userId);
        const gross =
          (r.basicSalary || 0) +
          (r.hra || 0) +
          (r.specialAllowance || 0) +
          (r.conveyance || 0) +
          (r.otherAllowances || 0);
        return {
          id: String(r._id),
          userId: r.userId,
          employeeName: u ? `${u.firstName} ${u.lastName}`.trim() : 'Unknown',
          employeeId: u?.employeeId ?? '',
          email: u?.email ?? '',
          basicSalary: r.basicSalary,
          hra: r.hra,
          specialAllowance: r.specialAllowance,
          conveyance: r.conveyance,
          otherAllowances: r.otherAllowances,
          pfDeduction: r.pfDeduction,
          professionalTax: r.professionalTax,
          otherDeductions: r.otherDeductions,
          bankName: r.bankName,
          bankAccountNumber: r.bankAccountNumber,
          ifscCode: r.ifscCode,
          panNumber: r.panNumber,
          designation: r.designation,
          department: r.department,
          monthlyGross: round2(gross),
        };
      }),
    };
  }

  async getCompensation(userId: string) {
    const row = await this.compensations.findOne({ userId, isActive: true }).lean().exec();
    if (!row) throw new NotFoundException('Salary structure not found for this employee');
    return row;
  }

  async upsertCompensation(dto: UpsertCompensationDto) {
    const user = await this.usersService.findByIdSafe(dto.userId);
    if (!user || user.isActive === false) {
      throw new NotFoundException('Employee not found');
    }
    if (!user.roles?.includes(SystemRole.EMPLOYEE) && !user.roles?.includes(SystemRole.DB_ADMIN)) {
      // Allow salary for employee/db_admin primarily; admin can still set for any active user if needed
    }

    const row = await this.compensations
      .findOneAndUpdate(
        { userId: dto.userId },
        {
          $set: {
            userId: dto.userId,
            basicSalary: dto.basicSalary,
            hra: dto.hra ?? 0,
            specialAllowance: dto.specialAllowance ?? 0,
            conveyance: dto.conveyance ?? 0,
            otherAllowances: dto.otherAllowances ?? 0,
            pfDeduction: dto.pfDeduction ?? 0,
            professionalTax: dto.professionalTax ?? 0,
            otherDeductions: dto.otherDeductions ?? 0,
            bankName: dto.bankName ?? '',
            bankAccountNumber: dto.bankAccountNumber ?? '',
            ifscCode: dto.ifscCode ?? '',
            panNumber: dto.panNumber ?? '',
            designation: dto.designation ?? '',
            department: dto.department ?? '',
            isActive: true,
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return row;
  }

  async generatePayslip(dto: GeneratePayslipDto, generatedBy: string) {
    const user = await this.usersService.findByIdSafe(dto.userId);
    if (!user || user.isActive === false) {
      throw new NotFoundException('Employee not found');
    }

    const compensation = await this.compensations
      .findOne({ userId: dto.userId, isActive: true })
      .lean()
      .exec();
    if (!compensation) {
      throw new BadRequestException('Set salary structure for this employee first');
    }

    const analytics = await this.attendanceService.getAttendanceAnalytics({
      userId: dto.userId,
      year: dto.year,
      month: dto.month,
    });

    const workingDays = Math.max(0, Number(analytics.totalDays ?? 0) - Number(analytics.weekendDays ?? 0));
    const presentDays = Number(analytics.presentDays ?? 0);
    const halfDays = Number(analytics.halfDays ?? 0);
    const paidLeaveDays = Number(analytics.paidLeaveDays ?? 0);
    const leaveDays = Number(analytics.leaveDays ?? 0);
    const unpaidLeaveDays = Math.max(0, leaveDays - paidLeaveDays);
    const absentDays = Number(analytics.absentDays ?? 0);

    const payableDays = round2(presentDays + halfDays * 0.5 + paidLeaveDays);
    const lopDays = round2(Math.max(0, workingDays - payableDays));

    const fullBasic = compensation.basicSalary || 0;
    const fullHra = compensation.hra || 0;
    const fullSpecial = compensation.specialAllowance || 0;
    const fullConveyance = compensation.conveyance || 0;
    const fullOtherAll = compensation.otherAllowances || 0;
    const fullGross = fullBasic + fullHra + fullSpecial + fullConveyance + fullOtherAll;

    const ratio = workingDays > 0 ? Math.min(1, payableDays / workingDays) : 1;
    const earnings = {
      basic: round2(fullBasic * ratio),
      hra: round2(fullHra * ratio),
      specialAllowance: round2(fullSpecial * ratio),
      conveyance: round2(fullConveyance * ratio),
      otherAllowances: round2(fullOtherAll * ratio),
      gross: 0,
    };
    earnings.gross = round2(
      earnings.basic +
        earnings.hra +
        earnings.specialAllowance +
        earnings.conveyance +
        earnings.otherAllowances,
    );

    const pf = round2((compensation.pfDeduction || 0) * ratio);
    const professionalTax = round2((compensation.professionalTax || 0) * ratio);
    const other = round2((compensation.otherDeductions || 0) * ratio);
    const lossOfPay = round2(Math.max(0, fullGross - earnings.gross));
    const deductions = {
      pf,
      professionalTax,
      lossOfPay,
      other,
      total: round2(pf + professionalTax + other),
    };
    const finalNet = round2(earnings.gross - pf - professionalTax - other);

    const periodLabel = `${MONTH_NAMES[dto.month - 1]} ${dto.year}`;
    const payload = {
      userId: dto.userId,
      year: dto.year,
      month: dto.month,
      periodLabel,
      employeeName: `${user.firstName} ${user.lastName}`.trim(),
      employeeId: user.employeeId ?? '',
      email: user.email,
      designation: compensation.designation || '',
      department: compensation.department || '',
      bankName: compensation.bankName || '',
      bankAccountNumber: compensation.bankAccountNumber || '',
      ifscCode: compensation.ifscCode || '',
      panNumber: compensation.panNumber || '',
      earnings,
      deductions,
      attendance: {
        workingDays,
        presentDays,
        halfDays,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        payableDays,
        lopDays,
      },
      netPay: finalNet,
      netPayInWords: amountInWordsInr(finalNet),
      generatedBy,
      generatedAt: new Date(),
    };

    const saved = await this.payslips
      .findOneAndUpdate(
        { userId: dto.userId, year: dto.year, month: dto.month },
        { $set: payload },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    const branding = await this.getBranding();
    return this.decoratePayslip(saved, branding);
  }

  async listPayslips(query: ListPayslipsQueryDto, requesterId: string, roles: string[]) {
    const isAdmin =
      roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);
    const filter: Record<string, unknown> = {};
    if (!isAdmin) {
      filter.userId = requesterId;
    } else if (query.userId) {
      filter.userId = query.userId;
    }
    if (query.year) filter.year = query.year;
    if (query.month) filter.month = query.month;

    const rows = await this.payslips
      .find(filter)
      .sort({ year: -1, month: -1 })
      .limit(200)
      .lean()
      .exec();

    const branding = await this.getBranding();
    return {
      data: rows.map((r) => this.decoratePayslip(r, branding)),
      branding,
    };
  }

  async getPayslip(
    id: string,
    requesterId: string,
    roles: string[],
  ) {
    const row = await this.payslips.findById(id).lean().exec();
    if (!row) throw new NotFoundException('Payslip not found');
    const isAdmin =
      roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);
    if (!isAdmin && row.userId !== requesterId) {
      throw new ForbiddenException('Not your salary slip');
    }
    const branding = await this.getBranding();
    return this.decoratePayslip(row, branding);
  }

  async getMyPayslipByMonth(userId: string, year: number, month: number) {
    const row = await this.payslips.findOne({ userId, year, month }).lean().exec();
    const branding = await this.getBranding();
    if (!row) {
      return { payslip: null, branding };
    }
    return { payslip: this.decoratePayslip(row, branding), branding };
  }

  private decoratePayslip(row: Record<string, unknown> | null, branding: PayrollBranding) {
    if (!row) return null;
    return {
      id: String(row._id),
      userId: row.userId,
      year: row.year,
      month: row.month,
      periodLabel: row.periodLabel,
      employeeName: row.employeeName,
      employeeId: row.employeeId,
      email: row.email,
      designation: row.designation,
      department: row.department,
      bankName: row.bankName,
      bankAccountNumber: row.bankAccountNumber,
      ifscCode: row.ifscCode,
      panNumber: row.panNumber,
      earnings: row.earnings,
      deductions: row.deductions,
      attendance: row.attendance,
      netPay: row.netPay,
      netPayInWords: row.netPayInWords,
      generatedAt: row.generatedAt,
      generatedBy: row.generatedBy,
      branding,
    };
  }
}
