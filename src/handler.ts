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
  statusCode: number;
  body: string | Buffer;
  headers: {
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
  handler: (event: Partial<HandlerEvent>, context?: HandlerContext) => Promise<any>;
}


export default class OpenAPIHandler {
  private routes: Route[];
  private baseurl: string;
  private title: string;
  private description: string;
  private version: string;

  constructor(opts: HandlerConstructorOpts) {
    this.routes = opts.routes;
    this.baseurl = opts.baseurl;
    this.title = opts.title;
    this.baseurl = opts.description;
    this.version = opts.version;
  }

  public async routeEvent(event: Partial<APIGatewayProxyEvent>): Promise<HandlerResponse> {
    const { path } = event;
  
    // swagger.json is a special endpoint that uses route information to generate openapi docs
    if (path.match(/^\/swagger.json/)) {
      return {
        statusCode: 200,
        body: JSON.stringify(this.getOpenAPISpec()),
        headers: {
          'content-type': 'application/json',
        },
      };
    }
  
    // route using pseudo-hapi routes
    return this.handleRoute(event);
  }
  
  // dank version of hapi's routing + joi validation
  private async handleRoute(event: Partial<APIGatewayProxyEvent>): Promise<HandlerResponse> {
    const { httpMethod, path, pathParameters, queryStringParameters, body, headers } = event;
  
    // sort routes by "specificity" i.e. just use path length 🙈
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
  
    // create mutable context object so handlers can change status codes and content types
    const context: HandlerContext = {
      raw: false,
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
      },
    };
  
    // pass event to handler
    const res = await handler({ ...event, payload }, context);
    return {
      statusCode: context.statusCode || 200,
      headers: context.headers || {},
      body: context.raw ? res : JSON.stringify(res),
    };
  }
  
  public getOpenAPISpec() {
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
      200: { description: 'Success' }, // default
    };
    let requestBody;
    const parameters: any[] = [];
  
    if (validation) {
      if (validation.headers) {
        _.mapValues(validation.headers, (joi: Joi.SchemaLike, name: string) => {
          const ref = this.createOpenAPIDef(this.nameToRef(name, `${operationId}Header`), joi, schemas);
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
          const ref = this.createOpenAPIDef(this.nameToRef(name, `${operationId}Path`), joi, schemas);
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
          const ref = this.createOpenAPIDef(this.nameToRef(name, `${operationId}Query`), joi, schemas);
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
        const schemaRef = this.createOpenAPIDef(payloadRef, joi, schemas);
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
  
    const tags = _.chain(route.tags)
      .map((tag) => _.get(tag, 'name', tag))
      .value();
  
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
  
  // adds the definition to the definitons array, returns the reference
  private createOpenAPIDef(name: string, joi: Joi.SchemaLike, schemas: any[]) {
    const def = joi2json(joi, (schema) => _.omit(schema, ['patterns', 'examples']));
    const ref = def.title || name;
    schemas.push({ ref, ...def });
    return ref;
  }
  
  // convert default
  private nameToRef(name: string, context: string = '') {
    const nameStandardised = _.chain(name)
      .camelCase()
      .upperFirst()
      .value();
    return `${context}${nameStandardised}`;
  }
}
