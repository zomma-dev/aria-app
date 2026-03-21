// /components/Header.tsx
import { Button } from '@renderer/components/ui/button';
import { ChevronLeft, FileText } from 'lucide-react';
interface HeaderProps {
  title: string;
  onBack: () => void;
  docUrl?: string;
  children?: React.ReactNode;
}

export function NavHeader({ title, onBack, docUrl, children }: HeaderProps) {
  return (
    <div className="draggable-area px-6 pb-4 pt-5">
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="px-3 text-muted-foreground hover:bg-white/70 hover:text-foreground"
          style={{ '-webkit-app-region': 'no-drag' }}
          onClick={onBack}
        >
          <ChevronLeft strokeWidth={2} className="!h-5 !w-5" />
          <span className="font-medium">Back</span>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[1.5rem] leading-tight text-foreground">
            {title}
          </p>
        </div>

        <div className="flex flex-1 justify-end gap-2">{children}</div>

        {!!docUrl && (
          <Button
            variant="outline"
            className="bg-white/70"
            size="sm"
            style={{ '-webkit-app-region': 'no-drag' }}
            onClick={() => window.open(docUrl, '_blank')}
          >
            <FileText strokeWidth={2} />
          </Button>
        )}
      </div>
    </div>
  );
}
