# Dataset Events

## Overview

Dataset-related events enable cross-service communication without tight coupling. The data microservice uses internal events for metadata generation and emits cross-service events to notify the analysis microservice.

## Event: `metadata.generateMetadata`

Internal event within the data microservice. Emitted by the `upload.uploadFile` action (and `metadata.retryGeneration`) after a dataset is created. Triggers background AI metadata generation.

```mermaid
sequenceDiagram
    participant Upload as upload service
    participant Metadata as metadata service

    Upload->>Metadata: emit("metadata.generateMetadata", payload)
    Metadata->>Metadata: Generate AI metadata (structured/unstructured)
    Metadata->>Metadata: Detect cross-dataset relationships
    Metadata->>Metadata: Update metadataStatus → ready/failed
    Metadata-->>AnalysisSvc: emit("datasetEvent.metadataReady", payload)
```

**Payload:**

| Field         | Type   | Description                              |
|---------------|--------|------------------------------------------|
| `datasetId`   | string | UUID of the dataset                      |
| `datasetType` | string | `structured-table` or `unstructured-text`|
| `name`        | string | Human-readable dataset name              |
| `sessionId`   | string | UUID of the owning session               |

**Handler group:** `metadata-workers` (load-balanced — only one data instance processes each event).

**Handler location:** `services/metadata/generateMetadata.event.ts`

## Event: `datasetEvent.metadataReady`

Fired by the data microservice when a dataset's metadata (column mappings, AI-generated descriptions, etc.) has been fully processed.

```mermaid
sequenceDiagram
    participant DataSvc as data microservice
    participant AnalysisSvc as analysis microservice

    DataSvc->>AnalysisSvc: emit("datasetEvent.metadataReady", payload)
    AnalysisSvc->>AnalysisSvc: Log receipt (future: update session metadata state)
```

**Payload:**

| Field       | Type   | Description                    |
|-------------|--------|--------------------------------|
| `datasetId` | string | UUID of the dataset            |
| `sessionId` | string | UUID of the owning session     |
| `name`      | string | Human-readable dataset name    |

**Handler group:** `analysis-workers` (load-balanced — only one analysis instance processes each event).

**Current behavior:** Logs the event. Placeholder for future session-level aggregated metadata state updates.

## Event: `sessionData.sessionDeleted`

Emitted by the session service (in microservice.analysis) when a session is deleted. The `sessionData` service (in microservice.data) listens for this event to cascade-delete datasets, uploaded files, text chunks, and embeddings.

**Payload:**

| Field       | Type   | Description                    |
|-------------|--------|--------------------------------|
| `sessionId` | string | UUID of the deleted session    |

## Cross-Service Dataset Access

The analysis microservice calls `dataset.listDatasets` (on the data microservice) when creating conversations to build the system prompt with dataset context. This is a synchronous cross-service call via `ctx.call()`.
