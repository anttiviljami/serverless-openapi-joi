# Serverless OpenAPI Joi Plugin Documentation

## Route object

The Route object defines an API endpoint.

Example:

```typescript
import Joi from 'joi';
import { Route } from 'serverless-openapi-joi/handler';

const routes: Route[] = [
  {
    method: 'PATCH',
    path: '/pets/{id}',
    operationId: 'updatePetById',
    handler: async (event) => ({ statusCode: 200 }),
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
]
```

@TODO: stub.

## Class: OpenAPIHandler

The `OpenAPIHandler` class is the easiest way to interact with serverless-openapi-joi. It is the default export when
requiring `serverless-openapi-joi/handler`.

```typescript
import OpenAPIHandler from 'serverless-openapi-joi/handler';
```

The class handles routing, validation and provides an endpoint with your OpenAPI definitions.

### Constructor

```typescript
const apiHandler = new OpenAPIHandler({
	routes,
	swaggerEndpoint: '/swagger.json',
  info: {
		title: 'Example CRUD Pet API',
		description: 'Example CRUD API to demonstrate auto-generated openapi docs with Joi',
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
	externalDocs: {
		description: 'README',
		url: 'https://github.com/anttiviljami/serverless-openapi-joi',
	},
	servers: [
		{
			description: 'local',
			url: 'http://localhost',
		},
  ],
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

### Methods

An instance of `OpenAPIHandler` exposes two public methods:

```typescript
apiHandler.handler(event: APIGatewayProxyEvent, context?: Context): Promise<HandlerResponse>
```

The `handler` method is an async lambda handler method. It either returns the passed through handler response or throws
a Boom error.

Boom errors should be caught and returned to the client:

```typescript
import Boom from 'boom';
export async function handler(event) {
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

```typescript
apiHandler.getSpecification(): OpenAPISPecification
```
The `getSpecification` method is an alias of `apiHandler.openapi.getSpecification()`

### Properties

Instances of `OpenAPIHandler` also expose public properties:

```typescript
apiHandler.openapi: OpenApiBuilder
```

`openapi` is a reference to a child instance of `OpenAPIBuilder`.

```typescript
apiHandler.swaggerEndpoint: string
```

`swaggerEndpoint` is the public endpoint where the OpenAPI specification is served as application/json

## Class: OpenAPIBuilder

The `OpenAPIBuilder` class builds the OpenAPI specification from meta and route information. It is the default export
when requiring `serverless-openapi-joi/openapi`.

```typescript
import OpenAPIBuilder from 'serverless-openapi-joi/openapi';
```

### Constructor

```typescript
const apiBuilder = new OpenAPIBuilder({
  routes,
  info: {
    title: 'Example CRUD Pet API',
    description: 'Example CRUD API to demonstrate auto-generated openapi docs with Joi',
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
  externalDocs: {
    description: 'README',
    url: 'https://github.com/anttiviljami/serverless-openapi-joi',
  },
  servers: [
    {
      description: 'local',
      url: 'http://localhost',
    },
  ],
});
```

The constructor method is otherwise the same as with `OpenAPIHandler`, only missing the swaggerEndpoint option.

### Methods

An instance of `OpenAPIBuilder` exposes only one public method

```typescript
apiBuilder.getSpecification(): OpenAPISPecification
```
The `getSpecification` method returns the openapi specification as an object

### Properties

Instances of `OpenAPIHandler` expose the following public properties:

```typescript
apiBuilder.info: OpenAPIInfo
```

Mutable reference to the info object passed through the constructor and used as is in the Open API spec.

```typescript
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
```

@TODO: 
- [ ] `public OPENAPI_VERSION: string = '3.0.0.';`
- [ ] `public routes: Route[];`
- [x] `public info: OpenAPIInfo;`
- [ ] `public servers: OpenAPIServer[];`
- [ ] `public externalDocs: OpenAPIExternalDocs;`
- [ ] `public securitySchemes: OpenAPISecuritySchemes;`
- [ ] `public security: OpenAPISecurityRequirement[];`

## Class: OpenApiJoiPlugin

The `OpenApiJoiPlugin` is a Serverless plugin class. It is exported as a module when requiring 'serverless-openapi-joi'.

```yaml
plugins:
  - serverless-openapi-joi
```

The plugin part of serverless-openapi-joi currently doesn't do much.

Some ideas for the plugin:
- Parse routes directly from `serverless.yml` function http events to avoid duplicate endpoint definitions
- Add `serverless openapi:generate` command which prints the openapi definitions either as json or yaml
- Add `serverless openapi:swaggeriui` command which generates a static Swagger UI documentation site
- Add option to deploy the Swagger UI site as an S3 website
