#!/usr/bin/env node
/**
 * Action & Event Types Generator
 *
 * Scans action and event files and generates:
 * 1. Individual type files per action/event (no conflicts)
 * 2. Combined registry file for typed ctx.call() and ctx.emit()/ctx.broadcast()
 *
 * Usage: npx ts-node lib/codegen/generate-action-types.ts <servicesPath> <outputPath>
 */

// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as fs from "fs";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";
import * as ts from "typescript";

interface ActionInfo {
  serviceName: string;
  actionName: string;
  fullName: string; // "serviceName.actionName"
  filePath: string;
  relativePath: string;
  hasParamsExport: boolean;
  hasResultExport: boolean;
  paramsTypeName: string | null;
  resultTypeName: string | null;
}

interface EventInfo {
  serviceName: string;
  eventName: string;
  fullName: string; // "serviceName.eventName"
  filePath: string;
  relativePath: string;
  hasPayloadExport: boolean;
  payloadTypeName: string | null;
}

/**
 * Parse an action file to extract exported Params and Result types
 */
function parseActionFile(filePath: string): {
  paramsTypeName: string | null;
  resultTypeName: string | null;
} {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  let paramsTypeName: string | null = null;
  let resultTypeName: string | null = null;

  // Look for exported interfaces/types ending with Params or Result
  ts.forEachChild(sourceFile, (node) => {
    // Check for export interface XxxParams or export type XxxParams
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (hasExport) {
        const name = node.name.text;
        if (name.endsWith("Params")) {
          paramsTypeName = name;
        } else if (name.endsWith("Result")) {
          resultTypeName = name;
        }
      }
    }
  });

  return { paramsTypeName, resultTypeName };
}

/**
 * Scan services folder and collect action info
 */
function scanActions(servicesPath: string): ActionInfo[] {
  const actions: ActionInfo[] = [];

  if (!fs.existsSync(servicesPath)) {
    console.error(`Services path does not exist: ${servicesPath}`);
    return actions;
  }

  const serviceDirs = fs.readdirSync(servicesPath, { withFileTypes: true });

  for (const serviceDir of serviceDirs) {
    if (!serviceDir.isDirectory()) continue;

    const serviceName = serviceDir.name;
    const serviceActionsPath = path.join(servicesPath, serviceName);

    const actionFiles = fs
      .readdirSync(serviceActionsPath)
      .filter((file) => file.endsWith(".action.ts"));

    for (const actionFile of actionFiles) {
      const actionName = actionFile.replace(/\.action\.ts$/, "");
      const fullPath = path.join(serviceActionsPath, actionFile);
      const { paramsTypeName, resultTypeName } = parseActionFile(fullPath);

      actions.push({
        serviceName,
        actionName,
        fullName: `${serviceName}.${actionName}`,
        filePath: fullPath,
        relativePath: path.relative(servicesPath, fullPath),
        hasParamsExport: !!paramsTypeName,
        hasResultExport: !!resultTypeName,
        paramsTypeName,
        resultTypeName,
      });
    }
  }

  return actions;
}

/**
 * Parse an event file to extract exported Payload type
 */
function parseEventFile(filePath: string): {
  payloadTypeName: string | null;
} {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  let payloadTypeName: string | null = null;

  // Look for exported interfaces/types ending with Payload
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (hasExport) {
        const name = node.name.text;
        if (name.endsWith("Payload")) {
          payloadTypeName = name;
        }
      }
    }
  });

  return { payloadTypeName };
}

/**
 * Scan services folder and collect event info
 */
function scanEvents(servicesPath: string): EventInfo[] {
  const events: EventInfo[] = [];

  if (!fs.existsSync(servicesPath)) {
    return events;
  }

  const serviceDirs = fs.readdirSync(servicesPath, { withFileTypes: true });

  for (const serviceDir of serviceDirs) {
    if (!serviceDir.isDirectory()) continue;

    const serviceName = serviceDir.name;
    const serviceEventsPath = path.join(servicesPath, serviceName);

    const eventFiles = fs
      .readdirSync(serviceEventsPath)
      .filter((file) => file.endsWith(".event.ts"));

    for (const eventFile of eventFiles) {
      const eventName = eventFile.replace(/\.event\.ts$/, "");
      const fullPath = path.join(serviceEventsPath, eventFile);
      const { payloadTypeName } = parseEventFile(fullPath);

      events.push({
        serviceName,
        eventName,
        fullName: `${serviceName}.${eventName}`,
        filePath: fullPath,
        relativePath: path.relative(servicesPath, fullPath),
        hasPayloadExport: !!payloadTypeName,
        payloadTypeName,
      });
    }
  }

  return events;
}

/**
 * Generate individual action type file
 */
function generateActionTypeFile(
  action: ActionInfo,
  outputPath: string,
): string {
  const outputFile = path.join(outputPath, "actions", `${action.fullName}.ts`);
  const relativeImportPath = path
    .relative(path.dirname(outputFile), action.filePath.replace(/\.ts$/, ""))
    .replace(/\\/g, "/");

  let content = `/**
 * Auto-generated types for ${action.fullName}
 * DO NOT EDIT - This file is generated by generate-action-types
 */

`;

  if (action.hasParamsExport && action.paramsTypeName) {
    content += `export type { ${action.paramsTypeName} as Params } from "${relativeImportPath}";\n`;
  } else {
    content += `export type Params = Record<string, unknown>;\n`;
  }

  if (action.hasResultExport && action.resultTypeName) {
    content += `export type { ${action.resultTypeName} as Result } from "${relativeImportPath}";\n`;
  } else {
    content += `export type Result = unknown;\n`;
  }

  return content;
}

/**
 * Generate individual event type file
 */
function generateEventTypeFile(event: EventInfo, outputPath: string): string {
  const outputFile = path.join(outputPath, "events", `${event.fullName}.ts`);
  const relativeImportPath = path
    .relative(path.dirname(outputFile), event.filePath.replace(/\.ts$/, ""))
    .replace(/\\/g, "/");

  let content = `/**
 * Auto-generated types for event ${event.fullName}
 * DO NOT EDIT - This file is generated by generate-action-types
 */

`;

  if (event.hasPayloadExport && event.payloadTypeName) {
    content += `export type { ${event.payloadTypeName} as Payload } from "${relativeImportPath}";\n`;
  } else {
    content += `export type Payload = Record<string, unknown>;\n`;
  }

  return content;
}

/**
 * Generate the combined registry file
 */
function generateRegistryFile(
  actions: ActionInfo[],
  events: EventInfo[],
): string {
  let actionImports = "";
  let actionRegistryEntries = "";
  let eventImports = "";
  let eventRegistryEntries = "";

  for (const action of actions) {
    const importName = action.fullName.replace(/\./g, "_");
    actionImports += `import type * as ${importName} from "./actions/${action.fullName}";\n`;
    actionRegistryEntries += `  "${action.fullName}": { params: ${importName}.Params; result: ${importName}.Result };\n`;
  }

  for (const event of events) {
    const importName = `event_${event.fullName.replace(/\./g, "_")}`;
    eventImports += `import type * as ${importName} from "./events/${event.fullName}";\n`;
    eventRegistryEntries += `  "${event.fullName}": { payload: ${importName}.Payload };\n`;
  }

  return `/**
 * Service Registry - Auto-generated
 * DO NOT EDIT - This file is generated by generate-action-types
 *
 * This provides type-safe service calls and event emitting:
 * ctx.call("auth.login", { email, password }) // TypeScript knows the params and result types
 * ctx.emit("user.created", { userId, email }) // TypeScript knows the payload types
 */

${actionImports}${eventImports}
/**
 * Registry of all service actions with their params and result types
 */
export interface ServiceRegistry {
${actionRegistryEntries}}

/**
 * Registry of all events with their payload types
 */
export interface EventRegistry {
${eventRegistryEntries}}

/**
 * All available action names
 */
export type ActionNames = keyof ServiceRegistry;

/**
 * All available event names
 */
export type EventNames = keyof EventRegistry;

/**
 * Get params type for an action
 */
export type ActionParams<T extends ActionNames> = ServiceRegistry[T]["params"];

/**
 * Get result type for an action
 */
export type ActionResult<T extends ActionNames> = ServiceRegistry[T]["result"];

/**
 * Get payload type for an event
 */
export type EventPayload<T extends EventNames> = EventRegistry[T]["payload"];
`;
}

/**
 * Generate typed context file
 */
function generateTypedContextFile(): string {
  return `/**
 * Typed Context - Auto-generated
 * DO NOT EDIT - This file is generated by generate-action-types
 */

import { Context as MoleculerContext, CallingOptions } from "moleculer";
import { 
  ServiceRegistry, 
  ActionNames, 
  ActionParams, 
  ActionResult,
  EventRegistry,
  EventNames,
  EventPayload,
} from "./registry";

/**
 * Extended Context with typed call, emit, and broadcast methods
 */
export interface TypedContext<P = unknown> extends Omit<MoleculerContext<P>, 'call' | 'emit' | 'broadcast'> {
  /**
   * Call a service action with type-safe params and result
   *
   * @example
   * const result = await ctx.call("auth.login", { email: "test@example.com", password: "secret" });
   * // result is typed as LoginResult
   */
  call<K extends ActionNames>(
    actionName: K,
    params: ActionParams<K>,
    opts?: CallingOptions
  ): Promise<ActionResult<K>>;

  /**
   * Call with unknown action (fallback for dynamic calls)
   */
  call<T = unknown>(
    actionName: string,
    params?: unknown,
    opts?: CallingOptions
  ): Promise<T>;

  /**
   * Emit an event (balanced across service instances)
   *
   * @example
   * await ctx.emit("user.created", { userId: "123", email: "test@example.com" });
   */
  emit<K extends EventNames>(
    eventName: K,
    payload: EventPayload<K>,
    opts?: object
  ): Promise<void>;

  /**
   * Broadcast an event to all service instances
   *
   * @example
   * await ctx.broadcast("config.updated", { key: "theme", value: "dark" });
   */
  broadcast<K extends EventNames>(
    eventName: K,
    payload: EventPayload<K>,
    opts?: object
  ): Promise<void>;
}

/**
 * Re-export registry types for convenience
 */
export type { 
  ServiceRegistry, 
  ActionNames, 
  ActionParams, 
  ActionResult,
  EventRegistry,
  EventNames,
  EventPayload,
};
`;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const servicesPath = args[0] || "./services";
  const outputPath = args[1] || "./__generated__";

  console.log(`📦 Scanning actions and events in: ${servicesPath}`);
  console.log(`📁 Output directory: ${outputPath}`);

  const actions = scanActions(servicesPath);
  const events = scanEvents(servicesPath);

  if (actions.length === 0 && events.length === 0) {
    console.log("⚠️  No action or event files found");
    return;
  }

  if (actions.length > 0) {
    console.log(`\n📝 Found ${actions.length} action(s):`);
    actions.forEach((a) => {
      const types = [];
      if (a.hasParamsExport) types.push(`Params: ${a.paramsTypeName}`);
      if (a.hasResultExport) types.push(`Result: ${a.resultTypeName}`);
      console.log(
        `   - ${a.fullName} ${types.length ? `(${types.join(", ")})` : "(no types)"}`,
      );
    });
  }

  if (events.length > 0) {
    console.log(`\n📬 Found ${events.length} event(s):`);
    events.forEach((e) => {
      const types = [];
      if (e.hasPayloadExport) types.push(`Payload: ${e.payloadTypeName}`);
      console.log(
        `   - ${e.fullName} ${types.length ? `(${types.join(", ")})` : "(no types)"}`,
      );
    });
  }

  // Create output directories
  const actionsDir = path.join(outputPath, "actions");
  const eventsDir = path.join(outputPath, "events");
  fs.mkdirSync(actionsDir, { recursive: true });
  fs.mkdirSync(eventsDir, { recursive: true });

  // Generate individual action type files
  if (actions.length > 0) {
    console.log(`\n⚙️  Generating action type files...`);
    for (const action of actions) {
      const content = generateActionTypeFile(action, outputPath);
      const outputFile = path.join(actionsDir, `${action.fullName}.ts`);
      fs.writeFileSync(outputFile, content);
      console.log(`   ✓ ${action.fullName}.ts`);
    }
  }

  // Generate individual event type files
  if (events.length > 0) {
    console.log(`\n⚙️  Generating event type files...`);
    for (const event of events) {
      const content = generateEventTypeFile(event, outputPath);
      const outputFile = path.join(eventsDir, `${event.fullName}.ts`);
      fs.writeFileSync(outputFile, content);
      console.log(`   ✓ ${event.fullName}.ts`);
    }
  }

  // Generate registry file
  console.log(`\n⚙️  Generating registry.ts...`);
  const registryContent = generateRegistryFile(actions, events);
  fs.writeFileSync(path.join(outputPath, "registry.ts"), registryContent);
  console.log(`   ✓ registry.ts`);

  // Generate typed context file
  console.log(`\n⚙️  Generating context.ts...`);
  const contextContent = generateTypedContextFile();
  fs.writeFileSync(path.join(outputPath, "context.ts"), contextContent);
  console.log(`   ✓ context.ts`);

  // Generate index file
  console.log(`\n⚙️  Generating index.ts...`);
  const indexContent = `/**
 * Generated Types - Auto-generated
 * DO NOT EDIT - This file is generated by generate-action-types
 */

export * from "./registry";
export * from "./context";
`;
  fs.writeFileSync(path.join(outputPath, "index.ts"), indexContent);
  console.log(`   ✓ index.ts`);

  console.log(
    `\n✅ Done! Generated ${actions.length} action type(s) and ${events.length} event type(s)`,
  );
}

main();
