#!/usr/bin/env node
/**
 * Generate Global Action & Event Types
 *
 * Scans ALL microservices and generates a global registry
 * that can be imported by any microservice for cross-service type-safe calls and events
 *
 * Usage: npx ts-node lib/codegen/generate-global-types.ts
 */

// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as fs from "fs";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";
import * as ts from "typescript";

const ROOT_DIR = path.resolve(__dirname, "../..");
const APPS_DIR = path.join(ROOT_DIR, "apps");
const GLOBAL_OUTPUT_DIR = path.join(ROOT_DIR, "lib", "__generated__");

interface ActionInfo {
  microservice: string;
  microservicePath: string;
  serviceName: string;
  actionName: string;
  fullName: string; // "serviceName.actionName"
  filePath: string;
  hasParamsExport: boolean;
  hasResultExport: boolean;
  paramsTypeName: string | null;
  resultTypeName: string | null;
}

interface EventInfo {
  microservice: string;
  microservicePath: string;
  serviceName: string;
  eventName: string;
  fullName: string; // "serviceName.eventName"
  filePath: string;
  hasPayloadExport: boolean;
  payloadTypeName: string | null;
}

interface MicroserviceInfo {
  name: string;
  path: string;
  servicesPath: string;
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

  ts.forEachChild(sourceFile, (node) => {
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
 * Find all microservices in the apps folder
 */
function findMicroservices(): MicroserviceInfo[] {
  const microservices: MicroserviceInfo[] = [];

  if (!fs.existsSync(APPS_DIR)) {
    return microservices;
  }

  const domainDirs = fs.readdirSync(APPS_DIR, { withFileTypes: true });

  for (const domainDir of domainDirs) {
    if (!domainDir.isDirectory()) continue;

    const domainPath = path.join(APPS_DIR, domainDir.name);
    const microserviceDirs = fs.readdirSync(domainPath, {
      withFileTypes: true,
    });

    for (const msDir of microserviceDirs) {
      if (!msDir.isDirectory()) continue;

      const msPath = path.join(domainPath, msDir.name);
      const servicesPath = path.join(msPath, "services");

      if (fs.existsSync(servicesPath)) {
        microservices.push({
          name: msDir.name,
          path: msPath,
          servicesPath,
        });
      }
    }
  }

  return microservices;
}

/**
 * Scan all actions across all microservices
 */
function scanAllActions(): ActionInfo[] {
  const actions: ActionInfo[] = [];
  const microservices = findMicroservices();

  for (const ms of microservices) {
    const serviceDirs = fs.readdirSync(ms.servicesPath, {
      withFileTypes: true,
    });

    for (const serviceDir of serviceDirs) {
      if (!serviceDir.isDirectory()) continue;

      const serviceName = serviceDir.name;
      const serviceActionsPath = path.join(ms.servicesPath, serviceName);

      const actionFiles = fs
        .readdirSync(serviceActionsPath)
        .filter((file) => file.endsWith(".action.ts"));

      for (const actionFile of actionFiles) {
        const actionName = actionFile.replace(/\.action\.ts$/, "");
        const fullPath = path.join(serviceActionsPath, actionFile);
        const { paramsTypeName, resultTypeName } = parseActionFile(fullPath);

        actions.push({
          microservice: ms.name,
          microservicePath: ms.path,
          serviceName,
          actionName,
          fullName: `${serviceName}.${actionName}`,
          filePath: fullPath,
          hasParamsExport: !!paramsTypeName,
          hasResultExport: !!resultTypeName,
          paramsTypeName,
          resultTypeName,
        });
      }
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
 * Scan all events across all microservices
 */
function scanAllEvents(): EventInfo[] {
  const events: EventInfo[] = [];
  const microservices = findMicroservices();

  for (const ms of microservices) {
    const serviceDirs = fs.readdirSync(ms.servicesPath, {
      withFileTypes: true,
    });

    for (const serviceDir of serviceDirs) {
      if (!serviceDir.isDirectory()) continue;

      const serviceName = serviceDir.name;
      const serviceEventsPath = path.join(ms.servicesPath, serviceName);

      const eventFiles = fs
        .readdirSync(serviceEventsPath)
        .filter((file) => file.endsWith(".event.ts"));

      for (const eventFile of eventFiles) {
        const eventName = eventFile.replace(/\.event\.ts$/, "");
        const fullPath = path.join(serviceEventsPath, eventFile);
        const { payloadTypeName } = parseEventFile(fullPath);

        events.push({
          microservice: ms.name,
          microservicePath: ms.path,
          serviceName,
          eventName,
          fullName: `${serviceName}.${eventName}`,
          filePath: fullPath,
          hasPayloadExport: !!payloadTypeName,
          payloadTypeName,
        });
      }
    }
  }

  return events;
}

/**
 * Generate global registry file
 */
function generateGlobalRegistry(
  actions: ActionInfo[],
  events: EventInfo[],
): string {
  let actionImports = "";
  let actionRegistryEntries = "";
  let eventImports = "";
  let eventRegistryEntries = "";

  for (const action of actions) {
    const importAlias = `${action.microservice.replace(/[.-]/g, "_")}_${action.serviceName.replace(/[.-]/g, "_")}_${action.actionName.replace(/[.-]/g, "_")}`;
    const relativePath = path
      .relative(GLOBAL_OUTPUT_DIR, action.filePath.replace(/\.ts$/, ""))
      .replace(/\\/g, "/");

    if (action.hasParamsExport && action.paramsTypeName) {
      actionImports += `import type { ${action.paramsTypeName} as ${importAlias}_Params } from "${relativePath}";\n`;
    }
    if (action.hasResultExport && action.resultTypeName) {
      actionImports += `import type { ${action.resultTypeName} as ${importAlias}_Result } from "${relativePath}";\n`;
    }

    const paramsType = action.hasParamsExport
      ? `${importAlias}_Params`
      : "Record<string, unknown>";
    const resultType = action.hasResultExport
      ? `${importAlias}_Result`
      : "unknown";

    actionRegistryEntries += `  "${action.fullName}": { params: ${paramsType}; result: ${resultType} };\n`;
  }

  for (const event of events) {
    const importAlias = `event_${event.microservice.replace(/[.-]/g, "_")}_${event.serviceName.replace(/[.-]/g, "_")}_${event.eventName.replace(/[.-]/g, "_")}`;
    const relativePath = path
      .relative(GLOBAL_OUTPUT_DIR, event.filePath.replace(/\.ts$/, ""))
      .replace(/\\/g, "/");

    if (event.hasPayloadExport && event.payloadTypeName) {
      eventImports += `import type { ${event.payloadTypeName} as ${importAlias}_Payload } from "${relativePath}";\n`;
    }

    const payloadType = event.hasPayloadExport
      ? `${importAlias}_Payload`
      : "Record<string, unknown>";

    eventRegistryEntries += `  "${event.fullName}": { payload: ${payloadType} };\n`;
  }

  return `/**
 * Global Service Registry - Auto-generated
 * DO NOT EDIT - This file is generated by generate-global-types
 *
 * Contains all actions and events from all microservices for cross-service type-safe calls
 */

${actionImports}${eventImports}
/**
 * Global registry of all service actions across all microservices
 */
export interface GlobalServiceRegistry {
${actionRegistryEntries}}

/**
 * Global registry of all events across all microservices
 */
export interface GlobalEventRegistry {
${eventRegistryEntries}}

/**
 * All available action names across all microservices
 */
export type GlobalActionNames = keyof GlobalServiceRegistry;

/**
 * All available event names across all microservices
 */
export type GlobalEventNames = keyof GlobalEventRegistry;

/**
 * Get params type for an action
 */
export type GlobalActionParams<T extends GlobalActionNames> = GlobalServiceRegistry[T]["params"];

/**
 * Get result type for an action
 */
export type GlobalActionResult<T extends GlobalActionNames> = GlobalServiceRegistry[T]["result"];

/**
 * Get payload type for an event
 */
export type GlobalEventPayload<T extends GlobalEventNames> = GlobalEventRegistry[T]["payload"];
`;
}

/**
 * Generate global typed context file
 */
function generateGlobalContext(): string {
  return `/**
 * Global Typed Context - Auto-generated
 * DO NOT EDIT - This file is generated by generate-global-types
 *
 * Provides type-safe ctx.call(), ctx.emit(), and ctx.broadcast() with autocomplete 
 * for ALL actions and events across all microservices
 */

import { Context as MoleculerContext, CallingOptions } from "moleculer";
import { 
  GlobalServiceRegistry, 
  GlobalActionNames, 
  GlobalActionParams, 
  GlobalActionResult,
  GlobalEventRegistry,
  GlobalEventNames,
  GlobalEventPayload,
} from "./registry";

/**
 * Authenticated user metadata added by authentication hook
 */
export interface AuthenticatedUser {
  email: string;
  id: string;
  isActive: boolean;
  isVerified: boolean;
  nickName: string;
  photo?: string;
}

/**
 * Typed call function with overloads
 */
interface TypedCall {
  /**
   * Call a service action with type-safe params and result
   */
  <K extends GlobalActionNames>(
    actionName: K,
    params: GlobalActionParams<K>,
    opts?: CallingOptions
  ): Promise<GlobalActionResult<K>>;
}

/**
 * Typed emit function with overloads
 */
interface TypedEmit {
  /**
   * Emit an event with type-safe payload (balanced across service instances)
   */
  <K extends GlobalEventNames>(
    eventName: K,
    payload: GlobalEventPayload<K>,
    opts?: object
  ): Promise<void>;
}

/**
 * Typed broadcast function with overloads
 */
interface TypedBroadcast {
  /**
   * Broadcast an event with type-safe payload (to all service instances)
   */
  <K extends GlobalEventNames>(
    eventName: K,
    payload: GlobalEventPayload<K>,
    opts?: object
  ): Promise<void>;
}

/**
 * Extended Context with typed call, emit, and broadcast methods for all microservice actions and events
 */
export interface TypedContext<P = unknown> extends Omit<MoleculerContext<P>, 'call' | 'emit' | 'broadcast'> {
  /**
   * Call a service action with type-safe params and result
   * Supports all actions from all microservices
   *
   * @example
   * // In microservice.auth, call an action from microservice.book:
   * const books = await ctx.call("book.list", { page: 1, limit: 10 });
   * // books is typed as ListBooksResult
   */
  call: TypedCall;

  /**
   * Emit an event (balanced across service instances)
   *
   * @example
   * await ctx.emit("user.created", { userId: "123", email: "test@example.com" });
   */
  emit: TypedEmit;

  /**
   * Broadcast an event to all service instances
   *
   * @example
   * await ctx.broadcast("config.updated", { key: "theme", value: "dark" });
   */
  broadcast: TypedBroadcast;
}

/**
 * Authenticated TypedContext with typed call method and authenticated user in meta.
 * Used when action has \\\`authentication: true\\\`
 */
export interface AuthenticatedTypedContext<P = unknown> extends TypedContext<P> {
  meta: TypedContext<P>["meta"] & { user: AuthenticatedUser };
}

/**
 * Re-export registry types for convenience
 */
export type { 
  GlobalServiceRegistry, 
  GlobalActionNames, 
  GlobalActionParams, 
  GlobalActionResult,
  GlobalEventRegistry,
  GlobalEventNames,
  GlobalEventPayload,
};
`;
}

/**
 * Generate index file
 */
function generateIndex(): string {
  return `/**
 * Global Generated Types - Auto-generated
 * DO NOT EDIT - This file is generated by generate-global-types
 */

export * from "./registry";
export * from "./context";
`;
}

/**
 * Main function
 */
function main() {
  console.log("🌍 Generating global types for all microservices...\n");

  const actions = scanAllActions();
  const events = scanAllEvents();

  if (actions.length === 0 && events.length === 0) {
    console.log("⚠️  No action or event files found");
    return;
  }

  // Group actions by microservice for display
  if (actions.length > 0) {
    const actionsByMicroservice = new Map<string, ActionInfo[]>();
    for (const action of actions) {
      const list = actionsByMicroservice.get(action.microservice) || [];
      list.push(action);
      actionsByMicroservice.set(action.microservice, list);
    }

    console.log(
      `📝 Found ${actions.length} action(s) across ${actionsByMicroservice.size} microservice(s):\n`,
    );
    for (const [ms, msActions] of actionsByMicroservice) {
      console.log(`   ${ms}:`);
      for (const action of msActions) {
        console.log(`      - ${action.fullName}`);
      }
    }
  }

  // Group events by microservice for display
  if (events.length > 0) {
    const eventsByMicroservice = new Map<string, EventInfo[]>();
    for (const event of events) {
      const list = eventsByMicroservice.get(event.microservice) || [];
      list.push(event);
      eventsByMicroservice.set(event.microservice, list);
    }

    console.log(
      `\n📬 Found ${events.length} event(s) across ${eventsByMicroservice.size} microservice(s):\n`,
    );
    for (const [ms, msEvents] of eventsByMicroservice) {
      console.log(`   ${ms}:`);
      for (const event of msEvents) {
        console.log(`      - ${event.fullName}`);
      }
    }
  }

  // Create output directory
  fs.mkdirSync(GLOBAL_OUTPUT_DIR, { recursive: true });

  // Generate files
  console.log(`\n⚙️  Generating global registry...`);
  fs.writeFileSync(
    path.join(GLOBAL_OUTPUT_DIR, "registry.ts"),
    generateGlobalRegistry(actions, events),
  );
  console.log(`   ✓ registry.ts`);

  console.log(`\n⚙️  Generating global context...`);
  fs.writeFileSync(
    path.join(GLOBAL_OUTPUT_DIR, "context.ts"),
    generateGlobalContext(),
  );
  console.log(`   ✓ context.ts`);

  console.log(`\n⚙️  Generating index...`);
  fs.writeFileSync(path.join(GLOBAL_OUTPUT_DIR, "index.ts"), generateIndex());
  console.log(`   ✓ index.ts`);

  console.log(`\n✅ Global types generated at: lib/__generated__/`);
  console.log(`   - ${actions.length} action(s)`);
  console.log(`   - ${events.length} event(s)`);
  console.log(`\n💡 Usage in action/event files:`);
  console.log(
    `   import { TypedContext } from "core.lib/__generated__/context";`,
  );
}

main();
