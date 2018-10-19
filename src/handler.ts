import _ from 'lodash';
import Boom from 'boom';
import Joi, { SchemaLike} from 'joi';
import joi2json from 'joi-to-json-schema';
import { APIGatewayProxyEvent } from 'aws-lambda';

const OPENAPI_VERSION = '3.0.0';

export interface HandlerConstructorOpts {
  routes: Route[];
  baseurl: string;
  title: string;
  description?: string;
  version?: string;
  swaggerEndpoint?: string;
}

export interface HandlerEvent extends APIGatewayProxyEvent {
  payload: any;
}

export interface HandlerContext {
  raw: boolean; // true = pass raw return value to body, false = convert return value to json string
  statusCode: number;
  headers: {
    [header: string]: string;
  };
}

export interface HandlerResponse {
  statusCode?: number;
  body?: string | Buffer;
  headers?: {
    [header: string]: string;
  };
}

export interface RouteTag {
  name: string;
  description: string;
}

export interface Route {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: Array<RouteTag | string>;
  validation?: {
    headers?: { [name: string]: SchemaLike }
    pathParameters?: { [name: string]: SchemaLike }
    queryStringParameters?: { [name: string]: SchemaLike; }
    payload?: SchemaLike;
  };
  responses?: {
    [responseCode: string]: {
      description: string;
      content?: any;
    };
  };
  handler: (event: Partial<HandlerEvent>, context?: HandlerContext) => Promise<HandlerResponse>;
}

export default class OpenAPIHandler {
  private routes: Route[];
  private baseurl: string;
  private title: string;
  private description: string;
  private version: string;
  private swaggerEndpoint: string;

  constructor(opts: HandlerConstructorOpts) {
    this.routes = opts.routes;
    this.baseurl = opts.baseurl;
    this.title = opts.title;
    this.baseurl = opts.baseurl;
    this.version = opts.version;
    this.swaggerEndpoint = _.isUndefined(opts.swaggerEndpoint) ? '/swagger.json' : opts.swaggerEndpoint;
  }

  public async handler(event: Partial<APIGatewayProxyEvent>): Promise<HandlerResponse> {
    const { path } = event;
  
    // special endpoint to serve swagger.json
    if (this.swaggerEndpoint && path.match(new RegExp(`^${this.swaggerEndpoint}$`))) {
      return {
        statusCode: 200,
        body: JSON.stringify(this.openAPIDefinition()),
        headers: {
          'content-type': 'application/json',
        },
      };
    }
  
    // route using pseudo-hapi routes
    return this.route(event);
  }
  
  public openAPIDefinition() {
    const schemas: any[] = [];
    const requestBodies: any[] = [];

    const paths = _.chain(this.routes)
      .map((path) => this.routeToPathDef(path, schemas, requestBodies))
      .groupBy('path') // group by paths
      .mapValues((methods) => _.chain(methods)
        .keyBy('method') // group by methods
        .mapValues((method) => _.omit(method, ['method', 'path'])) // omit strip method property
        .value())
      .value();
    const tags = _.chain(this.routes)
      .flatMap('tags')
      .map((tag) => typeof tag === 'string' ? { name: tag } : tag)
      .sortBy('description')
      .uniqBy('name')
      .value();

    const securitySchemes = {
      'ApiKey': {
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
      info: {
        title: this.title,
        description: this.description || '',
        version: this.version || '1.0.0',
      },
      servers: [{
        url: this.baseurl,
      }],
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

    const responses = route.responses ? route.responses : {
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

  // dank version of hapi's routing + joi validation
  private async route(event: Partial<APIGatewayProxyEvent>): Promise<HandlerResponse> {
    const { httpMethod, path, pathParameters, queryStringParameters, body, headers } = event;
  
    // sort routes by "specificity" i.e. just use path length 🙈
    // @TODO: maybe count slashes in path instead ?
    const sortedRoutes = this.routes.sort((b, a) => a.path.length - b.path.length);
  
    // match first route
    const matchedRoute = _.find(sortedRoutes, (route) => {
      if (route.method !== httpMethod) {
        return false;
      }
      const pathPattern = route.path
        .replace(/\{.*\}/g, '(.+)')
        .replace(/\//g, '\\/');
      return path.match(new RegExp(`^${pathPattern}`, 'g'));
    });
    if (!matchedRoute) {
      throw Boom.notFound('Route not found');
    }
  
    const { handler, validation } = matchedRoute as Route;
  
    // try to extract json payload from body
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      // suppress any json parsing errors
    }
  
    // maybe validate payload, pathParameters, queryStringParameters, headers
    if (validation) {
      const input = _.omitBy({
        headers,
        payload,
        pathParameters,
        queryStringParameters,
      }, _.isNil);
  
      const validationDefaults = {
        queryStringParameters: Joi.object().unknown(),
      };
  
      const validationResult = Joi.validate(input, {
        ...validationDefaults,
        ...validation,
        headers: Joi.object(headers || {}).unknown(), // headers are always partially defined
      });
  
      // throw a 400 error if there are any validation errors
      if (validationResult.error) {
        throw Boom.badRequest(validationResult.error.message);
      }
    }
  
    // pass event to handler enriched with parsed payload
    const res = await handler({ ...event, payload });
    return {
      statusCode: 200,
      ...res,
    };
  }
}
