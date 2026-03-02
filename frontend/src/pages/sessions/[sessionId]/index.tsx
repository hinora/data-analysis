/**
 * Session Workspace Page
 *
 * Main workspace for a single session — shows datasets panel,
 * conversations panel, and upload capability.
 */

import Link from "next/link";
import { useRouter } from "next/router";
import type React from "react";
import { useState } from "react";
import DatasetActions from "@/components/dataset/DatasetActions";
import DatasetList from "@/components/dataset/DatasetList";
import DatasetPreview from "@/components/dataset/DatasetPreview";
import { MetadataPanel } from "@/components/dataset/MetadataPanel";
import ConversationList from "@/components/session/ConversationList";
import { FileUpload } from "@/components/upload/FileUpload";
import {
  useCreateConversation,
  useDeleteConversation,
  useListConversations,
  useRenameConversation,
} from "@/hooks/useConversation";
import {
  useDeleteDataset,
  useListDatasets,
  usePreviewDataset,
  useRenameDataset,
} from "@/hooks/useDataset";
import {
  useDeleteSession,
  useGetSession,
  useRenameSession,
} from "@/hooks/useSession";

const SessionWorkspacePage: React.FC = () => {
  const router = useRouter();
  const { sessionId } = router.query;
  const id = typeof sessionId === "string" ? sessionId : undefined;

  const { data: session, isLoading } = useGetSession(id);
  const { data: datasets, isLoading: datasetsLoading } = useListDatasets(id);
  const { data: conversations, isLoading: conversationsLoading } =
    useListConversations(id);
  const createConversation = useCreateConversation();
  const renameConv = useRenameConversation();
  const deleteConv = useDeleteConversation();
  const renameDs = useRenameDataset();
  const deleteDs = useDeleteDataset();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<
    string | undefined
  >();

  const { data: previewData } = usePreviewDataset(selectedDatasetId);
  const selectedDataset = datasets?.find((d) => d.id === selectedDatasetId);

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        Loading session...
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#ef4444" }}>
        Session not found.
      </div>
    );
  }

  const handleRename = async () => {
    if (!newName.trim() || !id) return;
    try {
      await renameSession.mutateAsync({ id, name: newName.trim() });
      setIsRenaming(false);
      setNewName("");
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (
      !window.confirm(
        "Delete this session and all its data? This cannot be undone.",
      )
    )
      return;
    try {
      await deleteSession.mutateAsync(id);
      router.push("/sessions");
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          {isRenaming ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={session.name}
                style={{
                  padding: "4px 8px",
                  fontSize: 18,
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                }}
              />
              <button
                type="button"
                onClick={handleRename}
                style={{ padding: "4px 12px" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                style={{ padding: "4px 12px" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={() => {
                setIsRenaming(true);
                setNewName(session.name);
              }}
              title="Click to rename"
            >
              {session.name}
            </h1>
          )}
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Status: {session.status} · {session.datasetCount} datasets ·{" "}
            {session.conversationCount} conversations
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/sessions")}
            style={{ padding: "6px 12px", cursor: "pointer" }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteSession.isPending}
            style={{
              padding: "6px 12px",
              backgroundColor: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: deleteSession.isPending ? "not-allowed" : "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Datasets Panel */}
        <div
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>
            Datasets
          </h2>
          <FileUpload sessionId={session.id} />
          {datasetsLoading ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>
              Loading datasets...
            </p>
          ) : (
            <DatasetList
              datasets={(datasets || []).map((ds) => ({
                ...ds,
                createdAt: ds.createdAt,
              }))}
              onSelect={setSelectedDatasetId}
              selectedId={selectedDatasetId}
            />
          )}
        </div>

        {/* Conversations Panel */}
        <div
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Conversations
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (!id) return;
                  createConversation.mutate(
                    { sessionId: id },
                    {
                      onSuccess: () => {
                        router.push(`/sessions/${id}/chat`);
                      },
                    },
                  );
                }}
                disabled={createConversation.isPending}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#0066cc",
                  color: "#fff",
                  fontSize: 12,
                  cursor: createConversation.isPending
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                {createConversation.isPending ? "Creating..." : "+ New Chat"}
              </button>
              {conversations && conversations.length > 0 && (
                <Link
                  href={`/sessions/${id}/chat`}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    color: "#0066cc",
                    textDecoration: "none",
                  }}
                >
                  Open Chat →
                </Link>
              )}
            </div>
          </div>
          {conversationsLoading ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>
              Loading conversations...
            </p>
          ) : (
            <ConversationList
              conversations={conversations || []}
              onSelect={(_convId) => router.push(`/sessions/${id}/chat`)}
              onRename={async (convId, name) => {
                await renameConv.mutateAsync({ id: convId, name });
              }}
              onDelete={async (convId) => {
                if (!id) return;
                await deleteConv.mutateAsync({ id: convId, sessionId: id });
              }}
              isRenaming={renameConv.isPending}
              isDeleting={deleteConv.isPending}
            />
          )}
        </div>
      </div>

      {/* Dataset Detail Panel */}
      {selectedDataset && (
        <div
          style={{
            marginTop: 24,
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {selectedDataset.name}
            </h3>
            <DatasetActions
              datasetId={selectedDataset.id}
              datasetName={selectedDataset.name}
              onRename={async (dsId, name) => {
                await renameDs.mutateAsync({ id: dsId, name });
              }}
              onDelete={async (dsId) => {
                await deleteDs.mutateAsync(dsId);
                setSelectedDatasetId(undefined);
              }}
              isRenaming={renameDs.isPending}
              isDeleting={deleteDs.isPending}
            />
          </div>

          {/* Preview table */}
          {previewData && (
            <DatasetPreview
              columns={previewData.columns || []}
              rows={previewData.rows || []}
              datasetName={selectedDataset.name}
              previewCount={
                previewData.previewCount || previewData.rows?.length || 0
              }
              totalRows={selectedDataset.rowCount}
            />
          )}

          {/* Metadata */}
          {(selectedDataset.structuredMetadata ||
            selectedDataset.unstructuredMetadata) && (
            <div style={{ marginTop: 16 }}>
              <MetadataPanel
                metadataStatus={selectedDataset.metadataStatus}
                structuredMetadata={selectedDataset.structuredMetadata}
                unstructuredMetadata={selectedDataset.unstructuredMetadata}
                relationships={selectedDataset.relationships}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionWorkspacePage;
