import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/feedback/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateList, deleteList, type ListInfo } from "@/lib/feeds";
import { Loader2, Trash2 } from "lucide-react";

interface EditListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ListInfo | null;
  onSuccess?: () => void;
  onDelete?: () => void;
}

export function EditListModal({
  open,
  onOpenChange,
  list,
  onSuccess,
  onDelete,
}: EditListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description || "");
    }
  }, [list]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !list) {
      setError("List name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateList({
        list_uri: list.uri,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update list");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!list) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteList(list.uri);
      onDelete?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setError(null);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  if (!list) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit List"
      showCloseButton={false}
    >
      {showDeleteConfirm ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{list.name}"? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete List"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-list-name">Name</Label>
            <Input
              id="edit-list-name"
              placeholder="My List"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-list-description">Description (optional)</Label>
            <Textarea
              id="edit-list-description"
              placeholder="What's this list about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Type: {list.purpose.includes("modlist") ? "Moderation List" : "Curation List"}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
