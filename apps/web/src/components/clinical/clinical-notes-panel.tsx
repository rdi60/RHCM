"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import { formatIstDateTime } from "@/lib/ist";
import type { ClinicalNoteRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatStatus } from "@/lib/utils";

export function ClinicalNotesPanel({ visitId }: { visitId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [addendumFor, setAddendumFor] = useState<string | null>(null);
  const [addendumBody, setAddendumBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canWrite = hasPermission(PERMISSIONS.CLINICAL_NOTE_WRITE);

  const notesQuery = useQuery({
    queryKey: ["clinical-notes", visitId, selectedEntityId],
    queryFn: () =>
      api.get<ClinicalNoteRow[]>(
        `/visits/${visitId}/notes?entityId=${selectedEntityId}`,
      ),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: ["clinical-notes", visitId, selectedEntityId],
    });
  }

  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/visits/${visitId}/notes`, {
        entityId: selectedEntityId,
        body,
      }),
    onSuccess: () => {
      setBody("");
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to save note"),
  });

  const addendumMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.post(`/clinical-notes/${noteId}/addendum`, {
        entityId: selectedEntityId,
        body: addendumBody,
      }),
    onSuccess: () => {
      setAddendumFor(null);
      setAddendumBody("");
      invalidate();
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : "Failed to add addendum",
      ),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) return;
    addMutation.mutate();
  }

  // Root notes (not addenda), each followed by its chain of addenda.
  const roots = (notesQuery.data ?? []).filter((n) => !n.isAddendum);
  const addendaFor = (noteId: string) =>
    (notesQuery.data ?? []).filter((n) => n.supersedesNoteId === noteId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinical Notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {roots.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        {roots.length > 0 && (
          <div className="divide-y divide-border">
            {roots.map((note) => (
              <div key={note.id} className="py-3 first:pt-0">
                <div className="flex items-center justify-between">
                  <Badge variant="muted">{formatStatus(note.noteType)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatIstDateTime(note.authoredAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{note.body}</p>

                {addendaFor(note.id).map((addendum) => (
                  <div
                    key={addendum.id}
                    className="mt-2 border-l-2 border-primary/40 pl-3 text-sm"
                  >
                    <p className="text-xs text-muted-foreground">
                      Addendum · {formatIstDateTime(addendum.authoredAt)}
                    </p>
                    <p>{addendum.body}</p>
                  </div>
                ))}

                {canWrite &&
                  (addendumFor === note.id ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        className="rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 p-2 text-sm"
                        rows={2}
                        value={addendumBody}
                        onChange={(e) => setAddendumBody(e.target.value)}
                        placeholder="Addendum…"
                      />
                      <Button
                        size="sm"
                        onClick={() => addendumMutation.mutate(note.id)}
                        disabled={addendumMutation.isPending}
                      >
                        Save addendum
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1"
                      onClick={() => setAddendumFor(note.id)}
                    >
                      + Add addendum
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}

        {canWrite && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              className="rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 p-2 text-sm"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a clinical note…"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              size="sm"
              disabled={addMutation.isPending}
              className="self-start"
            >
              {addMutation.isPending ? "Saving…" : "Add note"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
