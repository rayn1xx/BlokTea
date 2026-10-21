import type { ReactNode } from 'react';
import { Modal } from '@alfalab/core-components/modal';

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 500,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 500 | 600 | 800;
}) {
  return (
    <Modal open={open} onClose={onClose} size={size} breakpoint={768}>
      <Modal.Header title={title} subtitle={subtitle} hasCloser sticky />
      <Modal.Content>{children}</Modal.Content>
      {footer && (
        <Modal.Footer sticky layout='start' gap={16}>
          {footer}
        </Modal.Footer>
      )}
    </Modal>
  );
}
