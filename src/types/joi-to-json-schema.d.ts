type SchemaLike = import('joi').SchemaLike;
declare module 'joi-to-json-schema' {
  function joi2js(joi: SchemaLike, transformer?: (any: any) => any): any;
  export = joi2js;
}