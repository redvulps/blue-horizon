import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/feedback/Modal";
import { Button } from "@/components/ui/button";
import {
  getActorLists,
  addListMember,
  removeListMember,
  getSubjectListMemberships,
  type ListInfo,
} from "@/lib/feeds";
import { Loader2, Plus, List, Minus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AddToListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectDid: string;
  subjectHandle: string;
  onCreateList?: () => void;
  refreshTrigger?: number;
}

export function AddToListModal({
  open,
  onOpenChange,
  subjectDid,
  subjectHandle,
  onCreateList,
  refreshTrigger = 0,
}: AddToListModalProps) {
  const [currentUserDid, setCurrentUserDid] = useState<string | null>(null);
  const [lists, setLists] = useState<ListInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  // Map of list_uri -> listitem_uri for existing memberships
  const [memberships, setMemberships] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const session = await getSession();
        if (session) {
          setCurrentUserDid(session.did);
        }
      } catch {
        // Ignore session errors
      }
    }
    fetchSession();
  }, []);

  const loadLists = useCallback(async () => {
    if (!currentUserDid) return;

    setIsLoading(true);
    setError(null);

    try {
      const [listsResponse, membershipsResponse] = await Promise.all([
        getActorLists(currentUserDid),
        getSubjectListMemberships(subjectDid),
      ]);

      setLists(listsResponse.lists);

      // Build membership map
      const membershipMap = new Map<string, string>();
      for (const m of membershipsResponse.memberships) {
        membershipMap.set(m.list_uri, m.listitem_uri);
      }
      setMemberships(membershipMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setIsLoading(false);
    }
  }, [currentUserDid, subjectDid]);

  useEffect(() => {
    if (open && currentUserDid) {
      void loadLists();
    }
  }, [open, currentUserDid, refreshTrigger, loadLists]);

  const handleAddToList = async (list: ListInfo) => {
    setProcessing(list.uri);
    setError(null);

    try {
      const result = await addListMember(list.uri, subjectDid);
      // Add to memberships map
      setMemberships((prev) => new Map(prev).set(list.uri, result.uri));
      // Update local member count
      setLists((prev) =>
        prev.map((l) =>
          l.uri === list.uri ? { ...l, member_count: l.member_count + 1 } : l,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to list");
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveFromList = async (list: ListInfo) => {
    const listitemUri = memberships.get(list.uri);
    if (!listitemUri) return;

    setProcessing(list.uri);
    setError(null);

    try {
      await removeListMember(listitemUri);
      // Remove from memberships map
      setMemberships((prev) => {
        const next = new Map(prev);
        next.delete(list.uri);
        return next;
      });
      // Update local member count
      setLists((prev) =>
        prev.map((l) =>
          l.uri === list.uri
            ? { ...l, member_count: Math.max(0, l.member_count - 1) }
            : l,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove from list");
    } finally {
      setProcessing(null);
    }
  };

  const handleClose = () => {
    setMemberships(new Map());
    setError(null);
    onOpenChange(false);
  };

  const handleCreateList = () => {
    onCreateList?.();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Add @${subjectHandle} to List`}
      showCloseButton={false}
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : lists.length === 0 ? (
          <div className="text-center py-6 space-y-4">
            <List className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">You don't have any lists yet.</p>
            <Button onClick={handleCreateList}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First List
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {lists.map((list) => {
                const isMember = memberships.has(list.uri);
                const isProcessing = processing === list.uri;

                return (
                  <button
                    key={list.uri}
                    onClick={() =>
                      isMember ? handleRemoveFromList(list) : handleAddToList(list)
                    }
                    disabled={isProcessing}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                      isMember
                        ? "bg-primary/10 border-primary/30"
                        : "hover:bg-accent border-border",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{list.name}</p>
                      {list.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {list.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {list.member_count} member
                        {list.member_count !== 1 ? "s" : ""} •
                        {list.purpose.includes("modlist") ? " Moderation" : " Curation"}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {isProcessing ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : isMember ? (
                        <Minus className="h-5 w-5 text-destructive" />
                      ) : (
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <Button variant="outline" className="w-full" onClick={handleCreateList}>
              <Plus className="mr-2 h-4 w-4" />
              Create New List
            </Button>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
