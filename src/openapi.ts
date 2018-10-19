import _ from 'lodash';
import Joi from 'joi';
import joi2json from 'joi-to-json-schema';
import { Route } from './handler';

const OPENAPI_VERSION = '3.0.0';

export interface OpenAPIInfo {
  title: string;
  description?: string;
  version: string;
  termsOfService?: string;
  license?: {
    name: string;
    url?: string;
  };
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
}

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPIExternalDocs {
  url: string;
  description?: string;
}

export interface OpenAPITag {
  name: string;
  description?: string;
  externalDocs?: OpenAPIExternalDocs;
}

export interface OpenAPIBuilderOpts {
  routes: Route[];
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  externalDocs?: OpenAPIExternalDocs;
}

export default class OpenAPIBuilder {
  private routes: Route[];
  private info: OpenAPIInfo;
  private servers: OpenAPIServer[];
  private externalDocs: OpenAPIExternalDocs;

  constructor(opts: OpenAPIBuilderOpts) {
    this.routes = opts.routes;
    this.info = opts.info;
    this.servers = opts.servers;
    this.externalDocs = opts.externalDocs;
  }

  public getDefinition() {
    const schemas: any[] = [];
    const requestBodies: any[] = [];

    const paths = _.chain(this.routes)
      .map((path) => this.routeToPathDef(path, schemas, requestBodies))
      .groupBy('path') // group by paths
      .mapValues((methods) =>
        _.chain(methods)
          .keyBy('method') // group by methods
          .mapValues((method) => _.omit(method, ['method', 'path'])) // omit strip method property
          .value(),
      )
      .value();
    const tags = _.chain(this.routes)
      .flatMap('tags')
      .map((tag) => (typeof tag === 'string' ? { name: tag } : tag))
      .sortBy('description')
      .uniqBy('name')
      .value();

    const securitySchemes = {
      ApiKey: {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
      },
    };
    const security = _.chain(securitySchemes)
      .keys()
      .map((scheme: string) => ({ [scheme]: [] }))
      .value();

    return {
      openapi: OPENAPI_VERSION,
      info: this.info,
      externalDocs: this.externalDocs,
      servers: this.servers,
      security,
      tags,
      paths,
      components: {
        securitySchemes,
        requestBodies: _.chain(requestBodies)
          .keyBy('ref')
          .mapValues((def) => _.omit(def, 'ref')) // omit ref property
          .value(),
        schemas: _.chain(schemas)
          .keyBy('ref')
          .mapValues((def) => _.omit(def, 'ref')) // omit ref property
          .value(),
      },
    };
  }

  // adds definitions from path validation to schemas array and returns the path definition itself
  private routeToPathDef(route: Route, schemas: any[], requestBodies: any[]) {
    const { path, method, summary, description, validation } = route;
    const operationId = route.operationId ? route.operationId : route.handler.name;

    const responses = route.responses
      ? route.responses
      : {
          200: { description: 'Success' }, // default response
        };

    const tags = _.chain(route.tags)
      .map((tag) => _.get(tag, 'name', tag))
      .value();

    let requestBody;
    const parameters: any[] = [];

    if (validation) {
      if (validation.headers) {
        _.mapValues(validation.headers, (joi: Joi.SchemaLike, name: string) => {
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Header`), joi, schemas);
          const joiDescription = _.get(joi, '_description') || `Request header: ${name}`;
          const joiRequired = _.get(joi, '_flags.presence', 'optional') === 'required';
          parameters.push({
            name,
            in: 'header',
            description: joiDescription,
            required: joiRequired,
            schema: {
              $ref: `#/components/schemas/${ref}`,
            },
          });
        });
      }

      if (validation.pathParameters) {
        _.mapValues(validation.pathParameters, (joi: Joi.SchemaLike, name: string) => {
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Path`), joi, schemas);
          const joiDescription = _.get(joi, '_description') || `Path parameter: ${name}`;
          parameters.push({
            name,
            in: 'path',
            description: joiDescription,
            required: true, // path params are always required
            schema: {
              $ref: `#/components/schemas/${ref}`,
            },
          });
        });
      }

      if (validation.queryStringParameters) {
        _.mapValues(validation.queryStringParameters, (joi: Joi.SchemaLike, name: string) => {
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Query`), joi, schemas);
          const joiDescription = _.get(joi, '_description') || `Query parameter: ${name}`;
          const joiRequired = _.get(joi, '_flags.presence', 'optional') === 'required';
          parameters.push({
            name,
            in: 'query',
            description: joiDescription,
            required: joiRequired,
            schema: {
              $ref: `#/components/schemas/${ref}`,
            },
          });
        });
      }

      if (validation.payload) {
        const joi = validation.payload;
        const payloadRef = `${this.nameToRef(operationId)}Payload`;
        const schemaRef = this.createSchema(payloadRef, joi, schemas);
        const joiDescription = _.get(joi, '_description') || `Request payload: ${operationId}`;
        requestBodies.push({
          ref: payloadRef,
          description: joiDescription,
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/${schemaRef}`,
              },
            },
          },
        });
        requestBody = { $ref: `#/components/requestBodies/${payloadRef}` };
      }
    }

    return {
      path,
      method: method.toLowerCase(),
      operationId,
      summary,
      description,
      tags,
      responses,
      parameters,
      requestBody,
    };
  }

  // converts a joi schema to OpenAPI compatible JSON schema definition
  private joiToOpenApiSchema(joi: Joi.SchemaLike) {
    return joi2json(joi, (schema) => _.omit(schema, ['patterns', 'examples']));
  }

  // takes a joi schema, puts
  private createSchema(name: string, joi: Joi.SchemaLike, schemas?: any[]) {
    const def = this.joiToOpenApiSchema(joi);
    const ref = def.title || name;
    const schema = { ref, ...def };
    if (schemas) {
      // store schema to schemas array, return reference
      schemas.push(schema);
      return ref;
    } else {
      // return the schema
      return schema;
    }
  }

  // convert a name to a standard reference
  private nameToRef(name: string, context: string = '') {
    const nameStandardised = _.chain(name)
      .camelCase()
      .upperFirst()
      .value();
    return `${context}${nameStandardised}`;
  }
}
