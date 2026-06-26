import { AlertTriangle } from "lucide-react";

/**
 * ConfirmDialog — نافذة تأكيد العمليات الحساسة
 * Props:
 *   open        — boolean
 *   title       — عنوان النافذة
 *   message     — نص التأكيد
 *   confirmText — نص زر التأكيد (افتراضي: "تأكيد")
 *   danger      — boolean (يجعل زر التأكيد أحمر)
 *   onConfirm   — () => void
 *   onCancel    — () => void
 */
export default function ConfirmDialog({ open, title = "تأكيد", message, confirmText = "تأكيد", danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={22} className={danger ? "text-destructive shrink-0 mt-0.5" : "text-yellow-500 shrink-0 mt-0.5"} />
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {message && <p className="text-sm text-muted-foreground mt-1">{message}</p>}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white ${danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
