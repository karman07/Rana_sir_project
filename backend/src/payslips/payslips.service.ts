import { periodEnd, periodLabel, periodStart } from '../common/pay-period';
import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role } from '@rms/shared';
import { Types, type Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import { CommissionCalculationService } from '../contracts/commission-calculation.service';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { DocumentsService } from '../documents/documents.service';
import { DocumentType } from '../documents/schemas/document.schema';
import { Job } from '../jobs/schemas/job.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { Salary } from '../salary/schemas/salary.schema';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/schemas/user.schema';
import type { ListPayslipsQueryDto } from './dto/payslip.dto';
import { renderPayslipPdf } from './payslip-pdf';
import { Payslip, type PayslipData } from './schemas/payslip.schema';

const monthStart = periodStart;
const monthEnd = periodEnd;
const checksumOf = (d: PayslipData) => createHash('sha256').update(JSON.stringify(d)).digest('hex');

@Injectable()
export class PayslipsService {
  constructor(
    @InjectModel(Payslip.name) private readonly payslips: Model<Payslip>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Salary.name) private readonly salaries: Model<Salary>,
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly counters: CounterService,
    private readonly documents: DocumentsService,
    private readonly calc: CommissionCalculationService,
    private readonly events: EventBusService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Issues the payslip for one payment, once its payout has been sent. It is built entirely from what was true at that moment
   * (the payment's own figures and the contract version it was billed on), so nothing later can change it.
   */
  async generateForPayment(paymentId: string, actor?: AuthUser) {
    const p = await this.payments.findById(paymentId).lean();
    if (!p) throw new NotFoundException('Payment not found');
    if (!['SENT', 'CONFIRMED'].includes(p.payout?.status ?? '')) throw new ConflictException({ message: 'A payslip is issued once the candidate has been paid', code: 'NOT_PAID' });
    if (await this.payslips.exists({ paymentId: p._id })) throw new ConflictException({ message: 'This payment already has a payslip', code: 'PAYSLIP_EXISTS' });

    const [contract, candidate, job, version] = await Promise.all([
      this.contracts.findById(p.contractId).lean(),
      this.users.findById(p.candidateId).select('name email').lean(),
      this.jobs.findById(p.jobId).select('spec.title companyId').populate('companyId', 'name').lean(),
      this.versions.findOne({ contractId: p.contractId, version: p.contractVersion }).lean(),
    ]);
    if (!contract || !candidate || !version) throw new NotFoundException('The payment is missing its contract or candidate');

    const t = version.terms;
    // The candidate's own rate: the contract rate less the platform's share, which is never shown.
    const share = this.calc.candidateShare(t.salary, t.salary.currency, t.commission);
    const rate = Math.round(t.salary.amount * share);
    const hours = p.hoursWorked;
    const label = periodLabel;
    const lines: PayslipData['lines'] = t.salary.period === 'HOUR' && hours !== undefined
      ? [{ label: `Hourly pay, ${label(p.period)}`, detail: `${hours} hours`, amount: p.candidateAmount }]
      : [{ label: `Pay for ${label(p.period)}`, amount: p.candidateAmount }];

    const n = await this.counters.next('payslip');
    const number = `PSL-${String(n).padStart(4, '0')}`;
    const data: PayslipData = {
      payslipNumber: number, issuedOn: new Date().toISOString().slice(0, 10), period: p.period, periodStart: monthStart(p.period), periodEnd: monthEnd(p.period),
      candidate: { name: candidate.name, email: candidate.email }, company: (job as any)?.companyId?.name ?? '', jobTitle: (job as any)?.spec?.title ?? t.title,
      contractNumber: contract.contractNumber, contractVersion: p.contractVersion, employmentType: t.employmentType,
      currency: p.currency, payBasis: t.salary.period, rate, ...(hours !== undefined ? { hoursWorked: hours } : {}),
      lines, netPay: p.candidateAmount,
      payment: { method: p.payout.method, reference: p.payout.reference, paidOn: p.payout.sentAt ? new Date(p.payout.sentAt).toISOString().slice(0, 10) : undefined },
    };
    const checksum = checksumOf(data);
    const co = (await this.settings.get()).company;
    const pdf = await renderPayslipPdf(data, checksum, { name: co.name, supportEmail: co.supportEmail || undefined });
    const salary = await this.salaries.findOne({ contractId: p.contractId, period: p.period }).select('_id').lean();
    const doc = await this.documents.registerGenerated(pdf, { id: String(p.candidateId), role: Role.CANDIDATE }, {
      type: DocumentType.PAYSLIP, fileName: `${number} ${p.period}.pdf`, mime: 'application/pdf', label: `Payslip ${p.period}`, related: { type: 'Payslip', id: number },
    });
    const created = await this.payslips.create({
      payslipNumber: number, paymentId: p._id, salaryId: salary?._id, contractId: p.contractId, candidateId: p.candidateId, period: p.period, currency: p.currency, netPay: p.candidateAmount,
      data, checksum, pdfDocumentId: new Types.ObjectId(doc.id),
    });
    await this.events.publish(DomainEvent.PAYSLIP_GENERATED, {
      actor: actor ? { id: actor.id, role: actor.role } : { id: null, role: 'SYSTEM' }, entity: { type: 'Payslip', id: created.id },
      data: { payslipId: created.id, payslipNumber: number, period: p.period, candidateId: String(p.candidateId), candidateName: candidate.name, jobTitle: data.jobTitle, netPay: p.candidateAmount, currency: p.currency },
    });
    return this.get(created.id, actor ?? ({ id: 'system', role: Role.ADMIN, name: 'System', email: '' } as AuthUser));
  }

  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.CANDIDATE) return { candidateId: new Types.ObjectId(user.id) };
    if (user.role === Role.ADMIN) return {};
    throw new ForbiddenException();
  }

  private view(p: any, detail: boolean) {
    const base = {
      id: String(p._id), payslipNumber: p.payslipNumber, period: p.period, currency: p.currency, netPay: p.netPay, issuedOn: p.data?.issuedOn, createdAt: p.createdAt,
      candidate: { id: String(p.candidateId), name: p.data?.candidate?.name }, company: p.data?.company, jobTitle: p.data?.jobTitle, contractNumber: p.data?.contractNumber,
      pdfDocumentId: p.pdfDocumentId ? String(p.pdfDocumentId) : undefined,
    };
    return detail ? { ...base, data: p.data, verified: checksumOf(p.data) === p.checksum, verificationCode: String(p.checksum).slice(0, 16).toUpperCase() } : base;
  }

  async list(q: ListPayslipsQueryDto, user: AuthUser) {
    const filter: Record<string, unknown> = this.scope(user);
    if (q.period) filter.period = q.period;
    if (q.candidateId && user.role === Role.ADMIN) filter.candidateId = new Types.ObjectId(q.candidateId);
    const { items, meta } = await paginate(this.payslips, filter as never, q, { sortable: ['period', 'createdAt', 'netPay', 'payslipNumber'], defaultSort: '-period', searchFields: ['payslipNumber', 'data.candidate.name', 'data.contractNumber'] });
    return { items: items.map((p: any) => this.view(p, false)), meta };
  }

  async get(id: string, user: AuthUser) {
    const p = await this.payslips.findOne({ _id: id, ...this.scope(user) } as never).lean();
    if (!p) throw new NotFoundException('Payslip not found');
    return this.view(p, true);
  }

  /** Payments that are paid but have no payslip, so Admin can issue one that was missed. */
  async missing() {
    const paid = await this.payments.find({ 'payout.status': { $in: ['SENT', 'CONFIRMED'] } }).select('_id paymentNumber period contractNumber').lean();
    const have = new Set((await this.payslips.find({ paymentId: { $in: paid.map((p) => p._id) } }).select('paymentId').lean()).map((x) => String(x.paymentId)));
    return paid.filter((p) => !have.has(String(p._id))).map((p) => ({ paymentId: String(p._id), paymentNumber: p.paymentNumber, period: p.period, contractNumber: p.contractNumber }));
  }
}
