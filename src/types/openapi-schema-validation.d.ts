declare module 'openapi-schema-validation' {
  export function validate(schema: any, version: number): {
    valid: boolean;
    errors: any[];
  };
}