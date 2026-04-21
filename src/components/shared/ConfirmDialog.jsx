import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Reusable confirmation dialog for destructive or irreversible actions.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onOpenChange
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {'default'|'destructive'} [props.variant]
 * @param {function} props.onConfirm
 * @param {boolean} [props.loading]
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  loading = false,
}) {
  const isDestructive = variant === 'destructive';

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle
            className="font-display text-lg"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription
              className="text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="font-[family-name:var(--font-body)]"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading}
            onClick={onConfirm}
            className="font-[family-name:var(--font-body)]"
            style={
              isDestructive
                ? {
                    backgroundColor: 'var(--color-status-error-dot)',
                    color: '#fff',
                    borderColor: 'var(--color-status-error-dot)',
                  }
                : {}
            }
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
