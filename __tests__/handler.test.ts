import Boom from 'boom';
import OpenAPIHandler from '../src/handler';
import { routes, dummyHandler } from './util/routes';
import { extend, ExtendedMatchers } from './util/jest-openapi';
extend(expect);

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
    },
  ],
  swaggerEndpoint: '/openapi.json',
  routes,
});

describe('Handler', () => {
  test('handler returns valid openapi v3 at /swagger.json', async () => {
    const res = await openapi.handler({
      httpMethod: 'GET',
      path: '/openapi.json',
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body.toString());
    (expect(json) as ExtendedMatchers).toBeValidOpenAPI();
  });

  test('handler throws a 404 not found with unknown route', async () => {
    const res = openapi.handler({
      httpMethod: 'GET',
      path: '/unknown-route',
    });
    expect(res).rejects.toThrowError(Boom);
    expect(res).rejects.toThrowErrorMatchingSnapshot();
  });

  test('handler passes through to handler if validation passes', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/pets/1',
      pathParameters: { id: '1' },
    };
    const res = await openapi.handler(event, null);
    expect(dummyHandler).lastCalledWith(event, null);
    expect(res.statusCode).toBe(200);
  });

  test('handler passes parsed payload as object', async () => {
    const payload = { name: 'test '};
    const event = {
      httpMethod: 'POST',
      path: '/pets',
      body: JSON.stringify(payload),
    };
    const res = await openapi.handler(event, null);
    expect(dummyHandler).lastCalledWith({ ...event, payload }, null);
    expect(res.statusCode).toBe(200);
  });

  test('handler throws a validation error with invalid path param', async () => {
    const res = openapi.handler({
      httpMethod: 'GET',
      path: '/pets/asd',
      pathParameters: { id: 'asd' },
    });
    expect(res).rejects.toThrowError(Boom);
    expect(res).rejects.toThrowErrorMatchingSnapshot();
  });

  test('handler throws a validation error with invalid query param', async () => {
    const res = openapi.handler({
      httpMethod: 'GET',
      path: '/pets?limit=-1',
      queryStringParameters: { limit: '-1' },
    });
    expect(res).rejects.toThrowError(Boom);
    expect(res).rejects.toThrowErrorMatchingSnapshot();
  });

  test('handler throws a validation error with invalid payload', async () => {
    const res = openapi.handler({
      httpMethod: 'POST',
      path: '/pets',
      body: JSON.stringify({ incorrect: 'param' }),
    });
    expect(res).rejects.toThrowError(Boom);
    expect(res).rejects.toThrowErrorMatchingSnapshot();
  });
});
