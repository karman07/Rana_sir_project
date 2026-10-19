import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import type { StoredUpload } from '../documents/documents.service';
import { AdjustPaymentDto, ConfirmBatchDto, ConfirmReceivedDto, PayoutBatchDto, ReleaseBatchDto, RequestPayDto, GeneratePaymentDto, LedgerQueryDto, ListPaymentsQueryDto, MarkPaidDto, NoteRequiredDto, PayoutDto, ProofQueryDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/** Manual, mutual payments: one side records, the other confirms. The commission split is visible to Admin only. */
@Controller('payments')
@RequireApprovedRecruiter()
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get() list(@Query() q: ListPaymentsQueryDto, @CurrentUser() u: AuthUser) { return this.service.list(q, u); }
  @Get('counts') counts(@CurrentUser() u: AuthUser) { return this.service.counts(u); }

  @Roles(Role.ADMIN) @Get('summary') summary() { return this.service.summary(); }
  @Roles(Role.ADMIN) @Get('ledger') ledger(@Query() q: LedgerQueryDto) { return this.service.listLedger(q); }

  @Roles(Role.ADMIN) @Post('generate') generate(@Body() dto: GeneratePaymentDto, @CurrentUser() u: AuthUser) { return this.service.generate(dto, u); }
  @Roles(Role.ADMIN) @HttpCode(200) @Post('billing/run') billing() { return this.service.runBilling(); }

  /* several at once, and the candidate asking for their pay. These sit above the :id routes so they are matched first. */
  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post('release-batch')
  releaseBatch(@Body() dto: ReleaseBatchDto, @CurrentUser() u: AuthUser) { return this.service.releaseBatch(dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post('confirm-batch')
  confirmBatch(@Body() dto: ConfirmBatchDto, @CurrentUser() u: AuthUser) { return this.service.confirmBatch(dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post('payout-batch')
  payoutBatch(@Body() dto: PayoutBatchDto, @CurrentUser() u: AuthUser) { return this.service.sendPayoutBatch(dto, u); }

  @Roles(Role.CANDIDATE) @Post('request')
  requestPay(@Body() dto: RequestPayDto, @CurrentUser() u: AuthUser) { return this.service.requestPay(dto, u); }

  @Roles(Role.CANDIDATE) @Get('my-requests')
  myRequests(@CurrentUser() u: AuthUser) { return this.service.myRequests(u); }

  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.get(id, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/adjust')
  adjust(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: AdjustPaymentDto, @CurrentUser() u: AuthUser) { return this.service.adjust(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/cancel')
  cancel(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteRequiredDto, @CurrentUser() u: AuthUser) { return this.service.cancel(id, dto.note, u); }

  /* company -> us */
  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post(':id/client/mark-paid')
  markPaid(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: MarkPaidDto, @CurrentUser() u: AuthUser) { return this.service.markPaid(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/client/confirm')
  confirm(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ConfirmReceivedDto, @CurrentUser() u: AuthUser) { return this.service.confirmReceived(id, dto, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/client/dispute')
  disputeClient(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteRequiredDto, @CurrentUser() u: AuthUser) { return this.service.dispute(id, dto.note, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/client/resolve')
  resolveClient(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteRequiredDto, @CurrentUser() u: AuthUser) { return this.service.resolveClient(id, dto.note, u); }

  /* us -> candidate */
  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/payout/send')
  send(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: PayoutDto, @CurrentUser() u: AuthUser) { return this.service.sendPayout(id, dto, u); }

  @Roles(Role.CANDIDATE) @HttpCode(200) @Post(':id/payout/confirm')
  confirmPayout(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) { return this.service.confirmPayout(id, u); }

  @Roles(Role.CANDIDATE) @HttpCode(200) @Post(':id/payout/dispute')
  disputePayout(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteRequiredDto, @CurrentUser() u: AuthUser) { return this.service.disputePayout(id, dto.note, u); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/payout/resolve')
  resolvePayout(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: NoteRequiredDto, @CurrentUser() u: AuthUser) { return this.service.resolvePayout(id, dto.note, u); }

  /** Screenshot or PDF of the transfer, for one side of the payment. */
  @Roles(Role.ADMIN, Role.RECRUITER) @HttpCode(200) @Post(':id/proof') @UseInterceptors(FileInterceptor('file'))
  proof(@Param('id', ParseObjectIdPipe) id: string, @Query() q: ProofQueryDto, @UploadedFile() file: StoredUpload | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException({ message: 'Attach a file', code: 'FILE_REQUIRED' });
    return this.service.attachProof(id, q.leg, file, u);
  }
}
