import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransformTemplate } from '@/lib/transformTemplates';

type TemplateCardProps = {
  template: TransformTemplate;
  selected: boolean;
  onSelect: () => void;
};

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      disabled={!template.available}
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-start rounded-xl border p-4 text-left transition-all',
        template.available
          ? selected
            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
            : 'border-border bg-white hover:border-border hover:bg-muted'
          : 'cursor-not-allowed border-border bg-muted opacity-60',
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3">
          <CheckCircle2 className="h-4 w-4 text-primary" />
        </span>
      )}
      {!template.available && (
        <span className="absolute right-3 top-3">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
      <div className="mb-1 text-sm font-semibold leading-tight">{template.label}</div>
      <div className="text-xs text-muted-foreground">
        {template.available ? `${template.fieldCount} fields` : 'เร็วๆ นี้'}
      </div>
    </button>
  );
}
