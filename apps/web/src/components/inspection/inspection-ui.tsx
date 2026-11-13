import { INSPECTION_STATUS_LABELS, type InspectionItem, type InspectionStatus } from '@alora/shared';
import { AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';

export interface InspectionCounts {
  ok: number;
  paper: number;
  attention: number;
  missing: number;
}
export interface InspectionPerson {
  staffId: string;
  name: string;
  discipline: string;
  employeeId: string | null;
  hireDate: string | null;
  isActive: boolean;
  counts: InspectionCounts;
  ready: boolean;
}
export interface InspectionOverviewRow extends InspectionPerson {
  missing: string[];
}
export interface InspectionPack extends InspectionPerson {
  items: InspectionItem[];
  documents: { id: string; title: string; documentType: string; createdAt: string }[];
}

const TONE: Record<InspectionStatus, { chip: string; icon: typeof CheckCircle2; iconClass: string; rule: string }> = {
  ok: { chip: 'border-emerald-300 bg-emerald-50 text-emerald-800', icon: CheckCircle2, iconClass: 'text-emerald-600', rule: 'border-l-emerald-500' },
  paper: { chip: 'border-sky-300 bg-sky-50 text-sky-800', icon: FileText, iconClass: 'text-sky-600', rule: 'border-l-sky-500' },
  attention: { chip: 'border-amber-300 bg-amber-50 text-amber-900', icon: AlertTriangle, iconClass: 'text-amber-600', rule: 'border-l-amber-500' },
  missing: { chip: 'border-rose-300 bg-rose-50 text-rose-800', icon: XCircle, iconClass: 'text-rose-600', rule: 'border-l-rose-600' },
};

export function StatusChip({ status, children }: { status: InspectionStatus; children?: React.ReactNode }) {
  const t = TONE[status];
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${t.chip}`}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {children ?? INSPECTION_STATUS_LABELS[status]}
    </span>
  );
}

/** One Schedule 3 item, as a row with a coloured left rule (prints in colour or greyscale). */
export function InspectionItemRow({ item }: { item: InspectionItem }) {
  const t = TONE[item.status];
  const Icon = t.icon;
  return (
    <li className={`flex gap-3 border-l-4 bg-white py-2.5 pl-3 pr-2 break-inside-avoid ${t.rule}`}>
      <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${t.iconClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-semibold text-ink">
            {item.schedule3 && <span className="mr-1.5 text-xs font-semibold text-slate-500">Sch. 3 ({item.schedule3})</span>}
            {item.title}
          </p>
          <StatusChip status={item.status} />
        </div>
        <p className="mt-0.5 text-sm text-slate-700">{item.summary}</p>
        {item.details.length > 0 && (
          <ul className="mt-1 text-sm text-slate-600">
            {item.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
