import { useState } from "react";
import { Modal } from "@/components/ui/feedback/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createList } from "@/lib/feeds";
import { Loader2 } from "lucide-react";

interface CreateListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (uri: string) => void;
}

export function CreateListModal({ open, onOpenChange, onSuccess }: CreateListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<"curatelist" | "modlist">("curatelist");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("List name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createList({
        name: name.trim(),
        purpose,
        description: description.trim() || undefined,
      });
      onSuccess?.(result.uri);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setPurpose("curatelist");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New List"
      showCloseButton={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="list-name">Name</Label>
          <Input
            id="list-name"
            placeholder="My List"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="list-description">Description (optional)</Label>
          <Textarea
            id="list-description"
            placeholder="What's this list about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label>List Type</Label>
          <RadioGroup
            value={purpose}
            onValueChange={(v) => setPurpose(v as "curatelist" | "modlist")}
            disabled={isSubmitting}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="curatelist" id="curatelist" />
              <Label htmlFor="curatelist" className="font-normal cursor-pointer">
                Curation List - A list of users for discovery
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="modlist" id="modlist" />
              <Label htmlFor="modlist" className="font-normal cursor-pointer">
                Moderation List - A list for muting or blocking
              </Label>
            </div>
          </RadioGroup>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
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
                Creating...
              </>
            ) : (
              "Create List"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
