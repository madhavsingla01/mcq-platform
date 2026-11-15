import { Button, Spinner } from './index';
import SmallPopup from './SmallPopup';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Quiz?',
  message = 'Are you sure you want to permanently delete this item?',
  details = 'This action cannot be undone. Associated attempts, comments and interactions will also be deleted.',
  confirmText = 'Delete permanently',
  cancelText = 'Cancel',
  isDeleting = false,
}) {
  return <SmallPopup isOpen={isOpen} onClose={onClose} title={title} description={message} destructive busy={isDeleting}
    actions={<>
      <Button type="button" variant="secondary" autoFocus onClick={onClose} disabled={isDeleting}>{cancelText}</Button>
      <Button type="button" variant="danger" style={{ background: '#ab262d', boxShadow: 'none' }} onClick={onConfirm} disabled={isDeleting}>
        {isDeleting && <Spinner size={16} />}
        {isDeleting ? 'Deleting…' : confirmText}
      </Button>
    </>}>
    {details && <p>{details}</p>}
  </SmallPopup>;
}
