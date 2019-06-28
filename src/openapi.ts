import _ from 'lodash';
import Joi from '@hapi/joi';
import joi2json from 'joi-to-json-schema';
import { Route } from './handler';

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

export interface OpenAPISecurityRequirement {
  [scheme: string]: string[];
}

export interface OpenAPISecuritySchemes {
  [scheme: string]: {
    type: string;
    description?: string;
    name?: string;
    in?: string;
    scheme?: string;
    bearerFormat?: string;
    flows?: {
      [flow: string]: {
        authorizationUrl?: string;
        tokenUrl?: string;
        refreshUrl?: string;
        scopes?: {
          [scope: string]: string;
        };
      };
    };
    openIdConnectUrl?: string;
  };
}

export interface OpenAPIComponents {
  schemas?: any;
  requestBodies?: any;
  securitySchemes?: OpenAPISecuritySchemes;
}

export interface OpenAPIPaths {
  [path: string]: {
    [method: string]: {
      operationId: string;
      summary?: string;
      description?: string;
      tags: string[];
      responses: {
        [responseCode: string]: {
          description: string;
          content?: any;
        };
      };
      parameters: any[];
      requestBody: any;
    };
  };
}

export interface OpenAPIBuilderOpts {
  routes: Route[];
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  externalDocs?: OpenAPIExternalDocs;
  securitySchemes?: OpenAPISecuritySchemes;
  security?: OpenAPISecurityRequirement[];
}

export default class OpenAPIBuilder {
  public OPENAPI_VERSION: string = '3.0.0.';
  public routes: Route[];
  public info: OpenAPIInfo;
  public servers: OpenAPIServer[];
  public externalDocs: OpenAPIExternalDocs;
  public securitySchemes: OpenAPISecuritySchemes;
  public security: OpenAPISecurityRequirement[];

  private schemas: any[];
  private requestBodies: any[];

  constructor(opts: OpenAPIBuilderOpts) {
    this.routes = opts.routes;
    this.info = opts.info;
    this.servers = opts.servers;
    this.externalDocs = opts.externalDocs;

    // default to serverless x-api-key header scheme
    this.securitySchemes = opts.securitySchemes || {
      ApiKey: {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
      },
    };

    // default to a list of all securitySchemes given
    this.security =
      opts.security ||
      _.chain(this.securitySchemes)
        .keys()
        .map((scheme) => ({ [scheme]: [] }))
        .value();
  }

  public getDefinition() {
    // reset schemas and requestBodies arrays
    this.schemas = [];
    this.requestBodies = [];

    // build paths and gather schemas + requestBodies
    const paths = _.chain(this.routes)
      .map((path) => this.routeToPathDef(path))
      .groupBy('path') // group by paths
      .mapValues((methods) =>
        _.chain(methods)
          .keyBy('method') // group by methods
          .mapValues((method) => _.omit(method, ['method', 'path'])) // omit strip method property
          .value(),
      )
      .value();

    // gather all tags from paths
    const tags = _.chain(this.routes)
      .flatMap('tags')
      .map((tag) => (typeof tag === 'string' ? { name: tag } : tag))
      .sortBy('description')
      .uniqBy('name')
      .value();

    // build the components object
    const components: OpenAPIComponents = _.omitBy(
      {
        schemas: _.chain(this.schemas)
          .keyBy('ref')
          .mapValues((def) => _.omit(def, 'ref'))
          .value(),
        requestBodies: _.chain(this.requestBodies)
          .keyBy('ref')
          .mapValues((def) => _.omit(def, 'ref'))
          .value(),
        securitySchemes: this.securitySchemes,
      },
      _.isNil,
    );

    return _.omitBy(
      {
        openapi: this.OPENAPI_VERSION,
        info: this.info,
        externalDocs: this.externalDocs,
        servers: this.servers,
        security: this.security,
        tags,
        paths,
        components,
      },
      _.isNil,
    );
  }

  // adds definitions from path validation to schemas array and returns the path definition itself
  private routeToPathDef(route: Route) {
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
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Header`), joi, this.schemas);
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
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Path`), joi, this.schemas);
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
          const ref = this.createSchema(this.nameToRef(name, `${operationId}Query`), joi, this.schemas);
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
        const schemaRef = this.createSchema(payloadRef, joi, this.schemas);
        const joiDescription = _.get(joi, '_description') || `Request payload: ${operationId}`;
        this.requestBodies.push({
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
