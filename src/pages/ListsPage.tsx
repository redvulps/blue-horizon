import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListCard } from "@/components/list/ListCard";
import { CreateListModal } from "@/components/list/CreateListModal";
import { EditListModal } from "@/components/list/EditListModal";
import { getActorLists, type ListInfo } from "@/lib/feeds";
import { getSession } from "@/lib/auth";
import { Plus } from "lucide-react";

function ListsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border rounded-lg">
          <div className="flex gap-3">
            <Skeleton className="h-14 w-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ListsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<ListInfo | null>(null);

  useEffect(() => {
    async function getCurrentUser() {
      try {
        const session = await getSession();
        if (session) {
          setCurrentHandle(session.handle);
        }
      } catch {
        // No session
      }
    }
    getCurrentUser();
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["actor-lists", currentHandle],
    queryFn: () => getActorLists(currentHandle!),
    enabled: !!currentHandle,
    staleTime: 1000 * 60 * 5,
  });

  const handleEditList = (list: ListInfo) => {
    setSelectedList(list);
    setEditModalOpen(true);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">My Lists</h1>
          {currentHandle && (
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          )}
        </header>

        <div className="p-4 space-y-4">
          {!currentHandle ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Sign in to view your lists</p>
              <Button asChild className="mt-4">
                <Link to="/welcome">Sign In</Link>
              </Button>
            </div>
          ) : isLoading ? (
            <ListsSkeleton />
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-4">Failed to load lists</p>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          ) : !data?.lists.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>You haven't created any lists yet</p>
              <Button className="mt-4" onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Your First List
              </Button>
            </div>
          ) : (
            data.lists.map((list) => (
              <ListCard
                key={list.uri}
                uri={list.uri}
                name={list.name}
                purpose={list.purpose}
                description={list.description}
                avatar={list.avatar}
                creatorHandle={list.creator_handle}
                creatorDisplayName={list.creator_display_name}
                memberCount={list.member_count}
                onSelect={() => navigate(`/lists/${encodeURIComponent(list.uri)}`)}
                onEdit={() => handleEditList(list)}
              />
            ))
          )}
        </div>
      </div>

      <CreateListModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={() => refetch()}
      />

      <EditListModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        list={selectedList}
        onSuccess={() => refetch()}
        onDelete={() => {
          queryClient.invalidateQueries({ queryKey: ["actor-lists"] });
        }}
      />
    </div>
  );
}
