import Joi from 'joi';
import { validate } from 'openapi-schema-validation';
import { APIGatewayProxyEvent } from 'aws-lambda';
import OpenAPIHandler from '../src/handler';

// validations
const validation = {
  petId: Joi.number().integer()
    .description('Unique identifier for pet in database')
    .example(1)
    .label('PetId'),

  petPayload: Joi.object({
    name: Joi.string()
      .description('Name of the pet')
      .example('Garfield')
      .label('PetName'),
  }).label('PetPayload'),

  limit: Joi.number().integer().positive()
    .description('Number of items to return')
    .example(25)
    .label('QueryLimit'),

  offset: Joi.number().integer().min(0)
    .description('Starting offset for returning items')
    .example(0)
    .label('QueryOffset'),
};

// api definition
const openapi = new OpenAPIHandler({
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
    }
  ],
  routes: [
    {
      method: 'GET',
      path: '/pets',
      operationId: 'getPets',
      handler: async () => ({ statusCode: 200 }),
      summary: 'List pets',
      description: 'Returns all pets in database',
      tags: [{ name: 'pets', description: 'Pet operations' }],
      validation: {
        queryStringParameters: {
          limit: validation.limit,
          offset: validation.offset,
        },
      },
      responses: {
        200: { description: 'List of pets in database' },
      },
    },
    {
      method: 'GET',
      path: '/pets/{id}',
      operationId: 'getPetById',
      handler: async () => ({ statusCode: 200 }),
      summary: 'Get a pet by its id',
      description: 'Returns a pet by its id in database',
      tags: ['pets'],
      validation: {
        pathParameters: {
          id: validation.petId,
        },
      },
      responses: {
        200: { description: 'Pet object corresponding to id' },
        404: { description: 'Pet not found' },
      },
    },
    {
      method: 'POST',
      path: '/pets',
      operationId: 'createPet',
      handler: async () => ({ statusCode: 201 }),
      summary: 'Create pet',
      description: 'Crete a new pet into the database',
      tags: ['pets'],
      validation: {
        payload: validation.petPayload,
      },
      responses: {
        201: { description: 'Pet created succesfully' },
      },
    },
    {
      method: 'PATCH',
      path: '/pets/{id}',
      operationId: 'updatePetById',
      handler: async () => ({ statusCode: 200 }),
      summary: 'Update pet',
      description: 'Update an existing pet in the database',
      tags: ['pets'],
      validation: {
        pathParameters: {
          id: validation.petId,
        },
        payload: validation.petPayload,
      },
      responses: {
        200: { description: 'Pet updated succesfully' },
        404: { description: 'Pet not found' },
      },
    },
    {
      method: 'DELETE',
      path: '/pets/{id}',
      operationId: 'deletePetById',
      handler: async () => ({ statusCode: 200 }),
      summary: 'Delete a pet by its id',
      description: 'Deletes a pet by its id in database',
      tags: ['pets'],
      validation: {
        pathParameters: {
          id: validation.petId,
        },
      },
      responses: {
        200: { description: 'Pet deleted succesfully' },
        404: { description: 'Pet not found' },
      },
    },
  ],
});

interface ExtendedMatchers extends jest.Matchers<any> {
  toBeValidOpenAPI: (document?: any) => object;
}

expect.extend({
  toBeValidOpenAPI(received: any, version: number = 3) {
    const { valid, errors } = validate(received, version);
    return valid ? {
      pass: true,
      message: () => `Document is valid openapi v${version}`,
    } : {
      pass: false,
      message: () => `Document is not valid openapi v${version}, ${errors.length} validation errors:\n` +
        JSON.stringify(errors, null, 2),
    };
  }
})

describe('Handler', () => {
  test('handler returns valid openapi v3 at /swagger.json', async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      httpMethod: 'GET',
      path: '/swagger.json',
      headers: {},
    };
    const { body } = await openapi.handler(event);
    const json = JSON.parse(body.toString());
    (expect(json) as ExtendedMatchers).toBeValidOpenAPI();
  });
});
