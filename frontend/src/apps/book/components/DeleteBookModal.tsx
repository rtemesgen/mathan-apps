import { Book } from '../types';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';

export function DeleteBookModal({ book, onClose, onConfirm }: { book: Book | null; onClose: () => void; onConfirm: (bookId: string) => void | Promise<void> }) {
  return <DeleteConfirmModal isOpen={!!book} title="Delete book?" message={book ? <>Are you sure you want to delete <strong className="text-[#121212]">{book.name}</strong>? Its transactions will also be deleted.</> : ''} onClose={onClose} onConfirm={() => book ? onConfirm(book.id) : undefined} successMessage="Cash Book deleted successfully." />;
}
