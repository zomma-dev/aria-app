import { Button } from '@renderer/components/ui/button';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';

interface VLMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VLMDialog({ open, onOpenChange }: VLMDialogProps) {
  const handleConfigureClick = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>VLM setup needed</DialogTitle>
          <DialogDescription className="text-foreground">
            Configure the vision-language model to start the agent.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleConfigureClick}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
