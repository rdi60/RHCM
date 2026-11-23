"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS } from "@rhcm/shared";
import type { PatientDocumentRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatIstDateTime } from "@/lib/ist";

const CATEGORIES = ["xray", "consent_form", "id_proof", "insurance", "clinical_photo", "other"] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scanStatusVariant(status: PatientDocumentRow["scanStatus"]) {
  if (status === "CLEAN") return "success" as const;
  if (status === "INFECTED" || status === "ERROR") return "destructive" as const;
  return "muted" as const;
}

export function DocumentsSection({ patientId }: { patientId: string }) {
  const { selectedEntityId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);
  const canDownload = hasPermission(PERMISSIONS.DOCUMENT_DOWNLOAD);
  const canDelete = hasPermission(PERMISSIONS.DOCUMENT_DELETE);

  const queryKey = ["documents", patientId, selectedEntityId];
  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => api.get<PatientDocumentRow[]>(`/patients/${patientId}/documents?entityId=${selectedEntityId}`),
    enabled: Boolean(selectedEntityId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  const downloadMutation = useMutation({
    mutationFn: (documentId: string) => api.get<{ downloadUrl: string }>(`/documents/${documentId}/download-url?entityId=${selectedEntityId}`),
    onSuccess: (res) => window.open(res.downloadUrl, "_blank", "noopener,noreferrer"),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to get download link"),
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => api.delete(`/documents/${documentId}?entityId=${selectedEntityId}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to delete document"),
  });

  async function handleFileSelected(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { documentId, uploadUrl } = await api.post<{ documentId: string; uploadUrl: string }>(
        `/patients/${patientId}/documents/upload-url`,
        { entityId: selectedEntityId, category, filename: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size },
      );
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!putRes.ok) throw new Error(`Storage upload failed (${putRes.status})`);
      await api.post(`/documents/${documentId}/confirm`, { entityId: selectedEntityId });
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>X-rays, consent forms, ID proofs, and other patient files — stored privately, never a public URL.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canUpload && (
          <div className="flex flex-wrap items-center gap-2 rounded-button border border-dashed border-border p-3">
            <select
              className="h-9 rounded-button border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/50 px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
            <Input
              ref={fileInputRef}
              type="file"
              className="h-9 max-w-xs"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
            />
            {uploading && <span className="text-sm text-muted-foreground">Uploading…</span>}
          </div>
        )}

        {documentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}

        {documentsQuery.data?.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-button border border-border p-3 text-sm">
            <div>
              <p className="font-medium">
                {doc.originalFilename} <span className="font-normal text-muted-foreground">· {doc.category.replace("_", " ")}</span>
              </p>
              <p className="text-muted-foreground">
                {formatSize(doc.sizeBytes)} · {formatIstDateTime(doc.uploadedAt)} {doc.uploadedBy ? `· ${doc.uploadedBy.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={scanStatusVariant(doc.scanStatus)}>{doc.scanStatus}</Badge>
              {canDownload && doc.scanStatus === "CLEAN" && (
                <Button size="sm" variant="outline" onClick={() => downloadMutation.mutate(doc.id)} disabled={downloadMutation.isPending}>
                  Download
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(doc.id)} disabled={deleteMutation.isPending}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
