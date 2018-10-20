import _ from 'lodash';
import Boom from 'boom';
import Joi, { SchemaLike } from 'joi';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import OpenAPIBuilder, { OpenAPITag, OpenAPISecurityRequirement, OpenAPIBuilderOpts } from './openapi';

export interface HandlerEvent extends APIGatewayProxyEvent {
  payload: any;
}

export interface HandlerResponse {
  statusCode?: number;
  body?: string | Buffer;
  headers?: {
    [header: string]: string;
  };
}

export interface Route {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: Array<OpenAPITag | string>;
  validation?: {
    headers?: { [name: string]: SchemaLike };
    pathParameters?: { [name: string]: SchemaLike };
    queryStringParameters?: { [name: string]: SchemaLike };
    payload?: SchemaLike;
  };
  responses?: {
    [responseCode: string]: {
      description: string;
      content?: any;
    };
  };
  security?: OpenAPISecurityRequirement[];
  handler: (event?: Partial<HandlerEvent>, context?: Context) => Promise<HandlerResponse>;
}

export interface HandlerConstructorOpts extends OpenAPIBuilderOpts {
  swaggerEndpoint?: string;
}

export default class OpenAPIHandler {
  public openapi: OpenAPIBuilder;
  public swaggerEndpoint: string;
  private routes: Route[];

  constructor(opts: HandlerConstructorOpts) {
    this.routes = opts.routes;
    this.openapi = new OpenAPIBuilder({
      routes: this.routes,
      info: opts.info,
      externalDocs: opts.externalDocs,
    });
    this.swaggerEndpoint = _.isUndefined(opts.swaggerEndpoint) ? '/swagger.json' : opts.swaggerEndpoint;
  }

  // get definition as object
  public getDefinition() {
    return this.openapi.getDefinition();
  }

  // lambda handler method
  public async handler(event: Partial<APIGatewayProxyEvent>, context?: Context): Promise<HandlerResponse> {
    const { path } = event;

    // special endpoint to serve swagger.json
    if (this.swaggerEndpoint && path.match(new RegExp(`^${this.swaggerEndpoint}$`))) {
      return {
        statusCode: 200,
        body: JSON.stringify(this.getDefinition()),
        headers: {
          'content-type': 'application/json',
        },
      };
    }

    // route using pseudo-hapi routes
    return this.route(event, context);
  }

  // dank version of hapi's routing + joi validation
  private async route(event: Partial<APIGatewayProxyEvent>, context?: Context): Promise<HandlerResponse> {
    const { httpMethod, path, pathParameters, queryStringParameters, body, headers } = event;

    // sort routes by "specificity" i.e. just use path length 🙈
    // @TODO: maybe count slashes in path instead ?
    const sortedRoutes = this.routes.sort((b, a) => a.path.length - b.path.length);

    // match first route
    const matchedRoute = _.find(sortedRoutes, (route) => {
      if (route.method !== httpMethod) {
        return false;
      }
      const pathPattern = route.path.replace(/\{.*\}/g, '(.+)').replace(/\//g, '\\/');
      return path.match(new RegExp(`^${pathPattern}`, 'g'));
    });

    if (!matchedRoute) {
      throw Boom.notFound(`Route not found. Hint: Route definition missing for ${httpMethod} ${path} ?`);
    }

    const { handler, validation } = matchedRoute as Route;

    // try to extract json payload from body
    const payload: { payload?: any } = {};
    try {
      payload.payload = JSON.parse(body);
    } catch {
      // suppress any json parsing errors
    }

    // maybe validate payload, pathParameters, queryStringParameters, headers
    if (validation) {
      const input = _.omitBy(
        {
          headers,
          pathParameters,
          queryStringParameters,
          ...payload,
        },
        _.isNil,
      );

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
    const res = await handler({ ...event, ...payload }, context);
    return {
      statusCode: 200,
      ...res,
    };
  }
}
