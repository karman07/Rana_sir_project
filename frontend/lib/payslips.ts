export interface PayslipListItem {
  id: string; payslipNumber: string; period: string; currency: string; netPay: number; issuedOn: string; createdAt: string;
  candidate: { id: string; name?: string }; company?: string; jobTitle?: string; contractNumber?: string; pdfDocumentId?: string;
}

export interface PayslipDetail extends PayslipListItem {
  verified: boolean; verificationCode: string;
  data: {
    payslipNumber: string; issuedOn: string; period: string; periodStart: string; periodEnd: string;
    candidate: { name: string; email: string }; company: string; jobTitle: string; contractNumber: string; contractVersion: number; employmentType: string;
    currency: string; payBasis: "HOUR" | "MONTH" | "YEAR"; rate: number; hoursWorked?: number;
    lines: { label: string; detail?: string; amount: number }[]; netPay: number; payment: { method?: string; reference?: string; paidOn?: string };
  };
}
