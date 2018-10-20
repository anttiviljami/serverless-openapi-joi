# Serverless OpenAPI Joi Plugin Documentation

<!-- toc -->

- [Route object](#route-object)
- [Class: `OpenApiJoiPlugin`](#class-openapijoiplugin)
- [Class: `OpenAPIHandler`](#class-openapihandler)
  - [Constructor: `new OpenAPIHandler(opts: HandlerConstructorOpts)`](#constructor-new-openapihandleropts-handlerconstructoropts)
  - [Method: `handler(event: APIGatewayProxyEvent, context?: Context): Promise`](#method-handlerevent-apigatewayproxyevent-context-context-promisehandlerresponse)
  - [Method: `getSpecification()`](#method-getspecification)
  - [Property: `openapi: OpenApiBuilder`](#property-openapi-openapibuilder)
  - [Property: `swaggerEndpoint: string`](#property-swaggerendpoint-string)
- [Class: OpenAPIBuilder](#class-openapibuilder)
  - [Constructor: `new OpenAPIBuilder(opts: OpenAPIBuilderOpts)`](#constructor-new-openapibuilderopts-openapibuilderopts)
  - [Method: `getSpecification()`](#method-getspecification)

<!-- tocstop -->

## Route object

The Route object defines an API endpoint and Joi validations for headers, path parameters, query string parameters and
json request payload. It has the following properties:

- `method: string` (required) - The HTTP method of this operation (get/post/put/patch/delete)
- `path: string` (required) - The relative path of this endpoint from API root
- `handler: async function` (required) - The lambda handler function for this endpoint. Gets called if validation passes.
- `operationId: string` (optional) - Unique OpenAPI [operationId](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#operation-object)
for this endpoint. Defaults to the handler function name
- `summary: string` (optional) - A short summary of what the operation does
- `description: string` (optional) - A verbose explanation of the operation behavior. CommonMark syntax MAY be used for rich text representation.
- `tags` (optional) - Array of tags as strings or [OpenAPI Tag Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#tag-object)
- `validation` (optional) - Joi validation rules for this endpoint:
  - `headers` (optional) - Map of known headers and Joi definitions for them
  - `pathParameters` (optional) - Map of required path parameters and Joi definitions for them
  - `queryStringParameters` (optional) - Map of known query string parameters and Joi definitions for them
  - `payload` (optional) - Joi validation for JSON payload
- `responses` (optional) - [OpenAPI Responses Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#responsesObject)
- `security` (optional) - Array of [OpenAPI Security Requirement Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securityRequirementObject) for this operation

Example Route object in array with validations:

```typescript
import Joi from 'joi';
import { Route } from 'serverless-openapi-joi/handler';

const routes: Route[] = [
  {
    method: 'PATCH',
    path: '/pets/{id}',
    operationId: 'updatePetById',
    handler: async (event, context) => ({ statusCode: 200 }),
    summary: 'Update pet',
    description: 'Update an existing pet in the database',
    tags: ['pets'],
    security: [{ ApiKey: [] }],
    validation: {
      pathParameters: {
        id: Joi.number().integer()
          .description('Unique identifier for pet in database')
          .example(1)
          .label('PetId'),
      },
      payload: Joi.object({
          name: Joi.string()
            .description('Name of the pet')
            .example('Garfield')
            .label('PetName');
          age: Joi.number().integer().min(0)
            .description('Age of the pet')
            .example(3)
            .label('PetAge');
        }).label('PetPayload'),
      queryStringParameters: {
        fields: Joi.string()
          .description('Comma separated list of Pet fields to include in response, default: all')
          .example('name,age')
          .label('PetFields'),
      },
      headers: {
        'cache-control': Joi.string()
          .description('Cache control header, default:"max-age=600"')
          .example('no-cache')
          .label('CacheControlHeader');
      }
    },
    responses: {
      200: { description: 'Pet updated succesfully' },
      404: { description: 'Pet not found' },
    },
  },
];
```

## Class: `OpenApiJoiPlugin`

`OpenApiJoiPlugin` is a Serverless plugin class. It is the main export when requiring `serverless-openapi-joi`.

Serverless loads the plugin by adding it to the plugins section of your `serverless.yml` file.

```yaml
plugins:
  - serverless-openapi-joi
```

The plugin part of serverless-openapi-joi currently doesn't do much.

Some ideas for the plugin:
- Parse routes directly from `serverless.yml` function http events to avoid duplicate endpoint definitions
- Add `serverless openapi:generate` command which prints the openapi definitions either as json or yaml
- Add `serverless openapi:swaggerui` command which generates a static Swagger UI documentation site
- Add option to deploy the Swagger UI site as an S3 website

## Class: `OpenAPIHandler`

The `OpenAPIHandler` class is the easiest way to interact with serverless-openapi-joi. The class handles routing,
validation and provides an endpoint with your OpenAPI definitions. It is the default export when importing
`serverless-openapi-joi/handler`. 

```typescript
import OpenAPIHandler from 'serverless-openapi-joi/handler'; // ES6 module syntax
// or
const OpenAPIHandler = require('serverless-openapi-joi/handler').default; // CommonJS syntax
```

### Constructor: `new OpenAPIHandler(opts: HandlerConstructorOpts)`

Creates a new `OpenAPIHandler` instance using the options provided.

- `opts: HandlerConstructorOpts` - Constructor options:
  - `routes: Route[]` (required) - Array of [Route objects](#route-object) defining API routes
  - `info: OpenAPIInfo` (required) - [OpenAPI Info Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#infoObject)
  - `servers: OpenAPIServer[]` (optional) - Array of [OpenAPI Server Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#server-object)
  - `externalDocs: OpenAPIExternalDocs` (optional) - [OpenAPI External Documentation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#externalDocumentationObject)
  - `securitySchemes: OpenAPISecuritySchemes` (optional) - Map of [OpenAPI Security Scheme Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#security-scheme-object)
  - `security: OpenAPISecurityRequirement` (optional) - Array of [OpenAPI Security Requirement Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securityRequirementObject)
  - `swaggerEndpoint: string` (optional) - An endpoint to serve the OpenAPI spec, default: 'swagger.json'

Example:

```typescript
const apiHandler = new OpenAPIHandler({
  routes,
  info: {
    title: 'Example API',
    description: 'Example CRUD API with Serverless OpenAPI Joi plugin',
    version: '1.0.0',
    termsOfService: 'https://github.com/anttiviljami/serverless-openapi-joi',
    license: {
      name: 'MIT',
      url: 'https://github.com/anttiviljami/serverless-openapi-joi/blob/master/LICENSE',
    },
    contact: {
      name: 'Viljami Kuosmanen',
      url: 'https://github.com/anttiviljami',
      email: 'viljami@avoinsorsa.fi',
    },
  },
  servers: [
    {
      description: 'local',
      url: 'http://localhost',
    },
  ],
  externalDocs: {
    description: 'README',
    url: 'https://github.com/anttiviljami/serverless-openapi-joi',
  },
  securitySchemes: {
    ApiKey: {
      type: 'apiKey',
      name: 'x-api-key',
      in: 'header',
    },
  },
  security: [
    { ApiKey: [] },
  ],
  swaggerEndpoint: '/swagger.json',
});
```

### Method: `handler(event: APIGatewayProxyEvent, context?: Context)`

The `handler` method is an async lambda handler method. It either returns the passed through handler response or throws
a [Boom error](https://github.com/hapijs/boom).

- `event: APIGatewayProxyEvent` (required) - [API Gateway Lambda-Proxy Event](https://serverless.com/framework/docs/providers/aws/events/apigateway/#example-lambda-proxy-event-default) object
- `context: Context` (optional) - API Gateway Lambda-Proxy Context object

Errors thrown by the handler should be caught and returned to the client. Boom errors are nicely formatted as JSON.
Example implementation of a Serverless handler using `OpenAPIHandler.handler()`:

```typescript
import OpenAPIHandler from 'serverless-openapi-joi/handler';
import Boom from 'boom';

export async function handler(event) {
  const apiHandler = new OpenAPIHandler({/* opts here */});
  return apiHandler.handler(event)
    .catch((err) => {
      let boom;
      if (err.isBoom) {
        boom = err.output;
      } else {
        console.error(err);
        boom = Boom.badImplementation('Internal API error').output;
      }
      return {
        statusCode: boom.statusCode,
        body: JSON.stringify(boom.payload),
      };
    });
};
```

### Method: `getSpecification()`

The `getSpecification` method is an alias of `apiHandler.openapi.getSpecification()`

### Property: `openapi: OpenApiBuilder`

`openapi` is a reference to a child instance of [`OpenAPIBuilder`](#class-openapibuilder).

### Property: `swaggerEndpoint: string`

`swaggerEndpoint` is the endpoint where the OpenAPI specification is served as application/json.


## Class: OpenAPIBuilder

The `OpenAPIBuilder` class builds the OpenAPI specification from meta and route information. It is the default export
when requiring `serverless-openapi-joi/openapi`.

```typescript
import OpenAPIBuilder from 'serverless-openapi-joi/openapi'; // ES6 syntax
// or
const OpenAPIBuilder = require('serverless-openapi-joi/openapi').default; // CommonJS syntax
```

### Constructor: `new OpenAPIBuilder(opts: OpenAPIBuilderOpts)`

Creates a new `OpenAPIBuilder` instance using the options provided.

- `opts: OpenAPIBuilderOpts` - Constructor options:
  - `routes: Route[]` (required) - Array of [Route objects](#route-object) defining API routes
  - `info: OpenAPIInfo` (required) - [OpenAPI Info Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#infoObject)
  - `servers: OpenAPIServer[]` (optional) - Array of [OpenAPI Server Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#server-object)
  - `externalDocs: OpenAPIExternalDocs` (optional) - [OpenAPI External Documentation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#externalDocumentationObject)
  - `securitySchemes: OpenAPISecuritySchemes` (optional) - Map of [OpenAPI Security Scheme Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#security-scheme-object)
  - `security: OpenAPISecurityRequirement` (optional) - Array of [OpenAPI Security Requirement Objects](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#securityRequirementObject)

Example:

```typescript
const apiBuilder = new OpenAPIBuilder({
  routes,
  info: {
    title: 'Example API',
    description: 'Example CRUD API with Serverless OpenAPI Joi plugin',
    version: '1.0.0',
    termsOfService: 'https://github.com/anttiviljami/serverless-openapi-joi',
    license: {
      name: 'MIT',
      url: 'https://github.com/anttiviljami/serverless-openapi-joi/blob/master/LICENSE',
    },
    contact: {
      name: 'Viljami Kuosmanen',
      url: 'https://github.com/anttiviljami',
      email: 'viljami@avoinsorsa.fi',
    },
  },
  servers: [
    {
      description: 'local',
      url: 'http://localhost',
    },
  ],
  externalDocs: {
    description: 'README',
    url: 'https://github.com/anttiviljami/serverless-openapi-joi',
  },
  securitySchemes: {
    ApiKey: {
      type: 'apiKey',
      name: 'x-api-key',
      in: 'header',
    },
  },
  security: [
    { ApiKey: [] },
  ],
});
```

### Method: `getSpecification()`

The `getSpecification` method returns the openapi specification as an object.

Example code for generating openapi spec and writing to file:

```typescript
import fs from 'fs';
import OpenAPIBuilder from 'serverless-openapi-joi/openapi'; // ES6 syntax

const openapi = new OpenAPIBuilder({/* opts here */});
const spec = openapi.getSpecification();
fs.writeFileSync('swagger.json', JSON.stringify(spec));
```
