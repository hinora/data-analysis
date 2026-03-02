/**
 * Fastest-Validator TypeScript Type Definitions
 * @see https://github.com/icebob/fastest-validator
 */

// ============================================================================
// Common Properties
// ============================================================================

/** Base properties shared by all validation rules */
interface BaseRule {
  /** Make field optional (default: false) */
  optional?: boolean;
  /** Allow null value */
  nullable?: boolean;
  /** Default value if undefined or null */
  default?:
    | unknown
    | ((
        schema: unknown,
        field: string,
        parent: unknown,
        context: unknown,
      ) => unknown);
  /** Label for error messages */
  label?: string;
  /** Custom error messages per validation type */
  messages?: Record<string, string>;
  /** Custom validation function(s) */
  custom?: CustomValidator | CustomValidator[] | string | string[];
}

/** Custom validator function signature */
type CustomValidator = (
  value: unknown,
  errors: ValidationError[],
  schema: unknown,
  name: string,
  parent: unknown,
  context: ValidationContext,
) => unknown;

/** Validation error object */
interface ValidationError {
  type: string;
  field?: string;
  message?: string;
  expected?: unknown;
  actual?: unknown;
  [key: string]: unknown;
}

/** Validation context */
interface ValidationContext {
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

// ============================================================================
// Built-in Validators
// ============================================================================

/** Any type - accepts any value without type validation */
interface AnyRule extends BaseRule {
  type: "any";
}

/** Array validator */
interface ArrayRule extends BaseRule {
  type: "array";
  /** If true, accepts empty array [] (default: true) */
  empty?: boolean;
  /** Minimum count of elements */
  min?: number;
  /** Maximum count of elements */
  max?: number;
  /** Fixed count of elements */
  length?: number;
  /** The array must contain this element */
  contains?: unknown;
  /** The array must be unique */
  unique?: boolean;
  /** Every element must be an element of the enum array */
  enum?: unknown[];
  /** Schema for array items */
  items?: ValidationRule | ValidationRuleShorthand;
  /** Wrap value into array if different type provided */
  convert?: boolean;
}

/** Boolean validator */
interface BooleanRule extends BaseRule {
  type: "boolean";
  /** Convert truthy/falsy values to boolean */
  convert?: boolean;
}

/** Class validator - check if value is instance of a class */
interface ClassRule extends BaseRule {
  type: "class";
  /** The class to check instanceof */
  instanceOf: new (
    ...args: unknown[]
  ) => unknown;
}

/** Currency validator */
interface CurrencyRule extends BaseRule {
  type: "currency";
  /** The currency symbol expected (as prefix) */
  currencySymbol?: string;
  /** Make the symbol optional */
  symbolOptional?: boolean;
  /** Thousand place separator (default: ",") */
  thousandSeparator?: string;
  /** Decimal place character (default: ".") */
  decimalSeparator?: string;
  /** Custom regex for validation */
  customRegex?: RegExp;
}

/** Date validator */
interface DateRule extends BaseRule {
  type: "date";
  /** Convert value to Date using new Date() */
  convert?: boolean;
  /** Minimum date value */
  min?: Date | string | number;
  /** Maximum date value */
  max?: Date | string | number;
}

/** Email validator */
interface EmailRule extends BaseRule {
  type: "email";
  /** If true, accepts empty string "" (default: false) */
  empty?: boolean;
  /** Checker method: "quick" or "precise" (default: "quick") */
  mode?: "quick" | "precise";
  /** Normalize email (trim & lower-case) */
  normalize?: boolean;
  /** Minimum length */
  min?: number;
  /** Maximum length */
  max?: number;
}

/** Enum validator */
interface EnumRule extends BaseRule {
  type: "enum";
  /** The valid values */
  values: readonly unknown[];
}

/** Equal validator - check if value equals a static value or another field */
interface EqualRule extends BaseRule {
  type: "equal";
  /** The expected static value */
  value?: unknown;
  /** Field name to compare with */
  field?: string;
  /** Use strict equality (===) */
  strict?: boolean;
}

/** Forbidden validator - field must not exist */
interface ForbiddenRule extends BaseRule {
  type: "forbidden";
  /** Remove the field from the original object */
  remove?: boolean;
}

/** Function validator */
interface FunctionRule extends BaseRule {
  type: "function";
}

/** Luhn algorithm validator (credit cards, IMEI, etc.) */
interface LuhnRule extends BaseRule {
  type: "luhn";
}

/** MAC address validator */
interface MacRule extends BaseRule {
  type: "mac";
}

/** Multi validator - allow multiple types */
interface MultiRule extends BaseRule {
  type: "multi";
  /** Array of validation rules */
  rules: ValidationRule[];
}

/** Number validator */
interface NumberRule extends BaseRule {
  type: "number";
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Must equal this value */
  equal?: number;
  /** Must not equal this value */
  notEqual?: number;
  /** Must be an integer */
  integer?: boolean;
  /** Must be positive (> 0) */
  positive?: boolean;
  /** Must be negative (< 0) */
  negative?: boolean;
  /** Convert string to number */
  convert?: boolean;
}

/** Object validator */
interface ObjectRule extends BaseRule {
  type: "object";
  /** If true, reject additional properties. If "remove", strip them */
  strict?: boolean | "remove";
  /** Minimum number of properties */
  minProps?: number;
  /** Maximum number of properties */
  maxProps?: number;
  /** Object properties schema */
  props?: ValidationSchema;
  /** Alternative name for props */
  properties?: ValidationSchema;
}

/** Record validator - object with arbitrary keys */
interface RecordRule extends BaseRule {
  type: "record";
  /** Key validation rule (typically string) */
  key?: ValidationRule | ValidationRuleShorthand;
  /** Value validation rule */
  value?: ValidationRule | ValidationRuleShorthand;
}

/** String validator */
interface StringRule extends BaseRule {
  type: "string";
  /** If true, accepts empty string "" (default: true) */
  empty?: boolean;
  /** Minimum length */
  min?: number;
  /** Maximum length */
  max?: number;
  /** Fixed length */
  length?: number;
  /** Regex pattern */
  pattern?: string | RegExp;
  /** Must contain this text */
  contains?: string;
  /** Must be one of these values */
  enum?: readonly string[];
  /** Must be alphabetic only */
  alpha?: boolean;
  /** Must be numeric string only */
  numeric?: boolean;
  /** Must be alphanumeric */
  alphanum?: boolean;
  /** Must be alphabetic with dashes */
  alphadash?: boolean;
  /** Must be hexadecimal */
  hex?: boolean;
  /** Must be single line (no newlines) */
  singleLine?: boolean;
  /** Must be base64 encoded */
  base64?: boolean;
  /** Trim whitespace */
  trim?: boolean;
  /** Trim left whitespace */
  trimLeft?: boolean;
  /** Trim right whitespace */
  trimRight?: boolean;
  /** Pad start to this length */
  padStart?: number;
  /** Pad end to this length */
  padEnd?: number;
  /** Padding character (default: " ") */
  padChar?: string;
  /** Convert to lowercase */
  lowercase?: boolean;
  /** Convert to uppercase */
  uppercase?: boolean;
  /** Convert to locale lowercase */
  localeLowercase?: boolean;
  /** Convert to locale uppercase */
  localeUppercase?: boolean;
  /** Convert non-string to string */
  convert?: boolean;
}

/** Tuple validator - array with specific element types */
interface TupleRule extends BaseRule {
  type: "tuple";
  /** If true, accepts empty array [] (default: true) */
  empty?: boolean;
  /** Schema for each element in order */
  items?: (ValidationRule | ValidationRuleShorthand)[];
}

/** URL validator */
interface UrlRule extends BaseRule {
  type: "url";
  /** If true, accepts empty string "" (default: false) */
  empty?: boolean;
}

/** UUID validator */
interface UuidRule extends BaseRule {
  type: "uuid";
  /** UUID version (0-8, null for any) */
  version?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/** ObjectID validator (Moleculer built-in, kept for legacy compat) */
interface ObjectIDRule extends BaseRule {
  type: "objectID";
  /** The ObjectID class */
  ObjectID?: new (
    ...args: unknown[]
  ) => unknown;
  /** Convert to ObjectID instance or hex string */
  convert?: boolean | "hexString";
}

/** Custom type validator with inline check function */
interface CustomRule extends BaseRule {
  type: "custom";
  /** Custom check function */
  check: (
    value: unknown,
    errors: ValidationError[],
    schema: CustomRule,
    field: string,
    parent: unknown,
    context: ValidationContext,
  ) => unknown;
  /** Additional properties for custom validation */
  [key: string]: unknown;
}

// ============================================================================
// Union Types & Shorthand
// ============================================================================

/** All validation rule types */
type ValidationRule =
  | AnyRule
  | ArrayRule
  | BooleanRule
  | ClassRule
  | CurrencyRule
  | DateRule
  | EmailRule
  | EnumRule
  | EqualRule
  | ForbiddenRule
  | FunctionRule
  | LuhnRule
  | MacRule
  | MultiRule
  | NumberRule
  | ObjectRule
  | RecordRule
  | StringRule
  | TupleRule
  | UrlRule
  | UuidRule
  | ObjectIDRule
  | CustomRule;

/**
 * Shorthand string definitions
 * @example "string", "number|optional", "string|min:3|max:255", "string[]"
 */
type ValidationRuleShorthand =
  | "any"
  | "array"
  | "boolean"
  | "date"
  | "email"
  | "forbidden"
  | "function"
  | "luhn"
  | "mac"
  | "number"
  | "object"
  | "string"
  | "tuple"
  | "url"
  | "uuid"
  | `${string}|${string}` // e.g., "string|optional", "number|min:0|max:100"
  | `${string}[]`; // e.g., "string[]", "number[]"

/** Nested object type definition using $$type */
interface NestedObjectRule extends BaseRule {
  $$type: "object" | `object|${string}`;
  [key: string]: ValidationRule | ValidationRuleShorthand | unknown;
}

/** Schema field definition - can be a rule, shorthand, or array for multi-type */
type SchemaField =
  | ValidationRule
  | ValidationRuleShorthand
  | NestedObjectRule
  | (ValidationRule | ValidationRuleShorthand)[];

/** Root element schema marker */
type RootSchema = ValidationRule & {
  $$root: true;
};

/**
 * Validation schema - the main schema object for defining validation rules
 */
interface ValidationSchema {
  /** Enable async validation */
  $$async?: boolean;
  /** Strict mode - reject additional properties */
  $$strict?: boolean | "remove";
  /** Mark as root element schema */
  $$root?: boolean;
  /** Field definitions */
  [field: string]: SchemaField | boolean | "remove" | undefined;
}

// ============================================================================
// Params Schema Type (for Moleculer actions)
// ============================================================================

/**
 * Action params schema type for fastest-validator
 * Use this type for the `params` field in action definitions
 *
 * @example
 * ```typescript
 * export default defineAction({
 *   params: {
 *     email: { type: "email" },
 *     password: { type: "string", min: 6 },
 *     age: { type: "number", optional: true, positive: true },
 *     role: { type: "enum", values: ["admin", "user"] },
 *     tags: { type: "array", items: "string", optional: true },
 *   } satisfies ParamsSchema,
 *   async handler(ctx) { ... }
 * });
 * ```
 */
export type ParamsSchema = {
  [field: string]: SchemaField;
};

// ============================================================================
// Export all types
// ============================================================================

export type {
  // Base types
  BaseRule,
  CustomValidator,
  ValidationError,
  ValidationContext,
  // Individual validators
  AnyRule,
  ArrayRule,
  BooleanRule,
  ClassRule,
  CurrencyRule,
  DateRule,
  EmailRule,
  EnumRule,
  EqualRule,
  ForbiddenRule,
  FunctionRule,
  LuhnRule,
  MacRule,
  MultiRule,
  NumberRule,
  ObjectRule,
  RecordRule,
  StringRule,
  TupleRule,
  UrlRule,
  UuidRule,
  ObjectIDRule,
  CustomRule,
  // Union & utility types
  ValidationRule,
  ValidationRuleShorthand,
  NestedObjectRule,
  SchemaField,
  RootSchema,
  ValidationSchema,
};
